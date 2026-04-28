import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"
import type { UserRole, PlatformRole } from "@prisma/client"
import {
  loadRoleContext,
  legacyRoleFromContext,
  type MembershipSummary,
  type RoleContext,
} from "@/lib/academy"

declare module "next-auth" {
  interface User {
    role?: UserRole
  }
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      // Legacy role, derived from RoleContext via legacyRoleFromContext.
      // Kept so existing code reading session.user.role continues to work
      // until Phase 1e sweeps the last STUDENT/INSTRUCTOR/ADMIN checks.
      role: UserRole
      // Phase 1 additions — consume these in new code.
      platformRole: PlatformRole
      platformRoles: PlatformRole[]
      memberships: MembershipSummary[]
    }
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: UserRole
    platformRole: PlatformRole
    platformRoles: PlatformRole[]
    memberships: MembershipSummary[]
  }
}

function ctxToJwtPatch(ctx: RoleContext | null) {
  return {
    platformRole: (ctx?.platformRole ?? "NONE") as PlatformRole,
    platformRoles: (ctx?.platformRoles ?? []) as PlatformRole[],
    memberships: ctx?.memberships ?? [],
    role: legacyRoleFromContext(ctx) as UserRole,
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        // Spec §3.2 — non-learner roles (Academy Admin, Platform Owner,
        // Course Developer, Marketer, Platform Support) may log in with
        // a username OR email. Learners are email-only. The single
        // "identifier" field accepts both; the resolver below picks the
        // right Prisma lookup and enforces the learner-is-email rule.
        identifier: { label: "Email or username", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const rawIdentifier =
          (credentials?.identifier as string | undefined) ||
          (credentials?.email as string | undefined)
        if (!rawIdentifier || !credentials?.password) {
          throw new Error("Invalid credentials")
        }
        const identifier = rawIdentifier.trim()
        const looksLikeEmail = identifier.includes("@")

        // Spec §18 — rate-limit keyed by lowercased identifier.
        const rl = checkRateLimit({
          route: "auth.credentials",
          key: identifier.toLowerCase(),
          limit: 10,
          windowMs: 60_000,
        })
        if (!rl.ok) {
          throw new Error("Too many attempts — try again shortly.")
        }

        const user = looksLikeEmail
          ? await prisma.user.findUnique({
              where: { email: identifier.toLowerCase() },
            })
          : await prisma.user.findUnique({
              where: { username: identifier },
            })

        if (!user || !user.password) {
          throw new Error("Invalid credentials")
        }

        // Spec §3.1 — learners log in with email only. Even if a row has
        // a username set (e.g. from a role transition), block username
        // login if the account's only academy membership is LEARNER.
        if (!looksLikeEmail) {
          const memberships = await prisma.academyMembership.findMany({
            where: { userId: user.id },
            select: { role: true },
          })
          const isLearnerOnly =
            memberships.length > 0 &&
            memberships.every((m) => m.role === "LEARNER") &&
            user.platformRole === "NONE"
          if (isLearnerOnly) {
            throw new Error("Learners must sign in with email + password.")
          }
        }

        if (!user.isActive) {
          throw new Error("Account is deactivated")
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        )

        if (!isValid) {
          throw new Error("Invalid credentials")
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        }
      },
    }),
  ],
  callbacks: {
    async signIn() {
      return true
    },
    async jwt({ token, user, trigger }) {
      // Initial sign-in: user is populated. Load full role context and cache.
      if (user) {
        token.id = user.id as string
        const ctx = await loadRoleContext(user.id as string)
        Object.assign(token, ctxToJwtPatch(ctx))
      }

      // Explicit session refresh, e.g. after role change via session.update().
      if (trigger === "update" && token.id) {
        const ctx = await loadRoleContext(token.id as string)
        Object.assign(token, ctxToJwtPatch(ctx))
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = (token.role as UserRole) ?? "STUDENT"
        session.user.platformRole = (token.platformRole as PlatformRole) ?? "NONE"
        session.user.platformRoles = (token.platformRoles as PlatformRole[]) ?? []
        session.user.memberships = (token.memberships as MembershipSummary[]) ?? []
      }
      return session
    },
  },
})
