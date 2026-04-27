import type { AcademyRole, PlatformRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type MembershipSummary = {
  academyId: string
  academySlug: string
  role: AcademyRole
}

export type RoleContext = {
  userId: string
  platformRole: PlatformRole
  memberships: MembershipSummary[]
}

/**
 * Load the full role context for a user — the platform role plus every academy
 * membership. Used by the NextAuth callbacks to build the JWT and by server
 * components that need to decide what UI to render.
 */
export async function loadRoleContext(userId: string): Promise<RoleContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      platformRole: true,
      isActive: true,
      academyMemberships: {
        select: {
          academyId: true,
          role: true,
          academy: { select: { slug: true, isActive: true } },
        },
      },
    },
  })

  if (!user || !user.isActive) return null

  return {
    userId: user.id,
    platformRole: user.platformRole,
    memberships: user.academyMemberships
      .filter((m) => m.academy.isActive)
      .map((m) => ({
        academyId: m.academyId,
        academySlug: m.academy.slug,
        role: m.role,
      })),
  }
}

export function hasPlatformRole(
  ctx: RoleContext | null | undefined,
  ...roles: PlatformRole[]
): boolean {
  if (!ctx) return false
  return roles.includes(ctx.platformRole)
}

export function hasAcademyRole(
  ctx: RoleContext | null | undefined,
  academyId: string,
  ...roles: AcademyRole[]
): boolean {
  if (!ctx) return false
  const m = ctx.memberships.find((x) => x.academyId === academyId)
  if (!m) return false
  return roles.includes(m.role)
}

export function getMembership(
  ctx: RoleContext | null | undefined,
  academyId: string
): MembershipSummary | undefined {
  return ctx?.memberships.find((m) => m.academyId === academyId)
}

/**
 * Preferred academy to land in when a user has no explicit context:
 *   - If they have exactly one membership, that one.
 *   - Otherwise the first ACADEMY_ADMIN / COURSE_DEVELOPER / MARKETER membership.
 *   - Otherwise the first LEARNER membership.
 *   - Otherwise undefined (platform-only user).
 */
export function pickDefaultAcademy(ctx: RoleContext | null | undefined): MembershipSummary | undefined {
  if (!ctx || ctx.memberships.length === 0) return undefined
  if (ctx.memberships.length === 1) return ctx.memberships[0]
  const priority: AcademyRole[] = ["ACADEMY_ADMIN", "COURSE_DEVELOPER", "MARKETER", "LEARNER"]
  for (const role of priority) {
    const hit = ctx.memberships.find((m) => m.role === role)
    if (hit) return hit
  }
  return ctx.memberships[0]
}

/**
 * Legacy-role bridge. Until every call site is migrated off the old
 * User.role enum, translate a RoleContext back to the old strings so the
 * existing middleware and route handlers keep working. Deleted in Phase 1e
 * once all INSTRUCTOR / STUDENT / ADMIN string checks are gone.
 */
export function legacyRoleFromContext(
  ctx: RoleContext | null | undefined
): "ADMIN" | "INSTRUCTOR" | "STUDENT" {
  if (!ctx) return "STUDENT"
  if (ctx.platformRole === "PLATFORM_OWNER" || ctx.platformRole === "PLATFORM_SUPPORT") return "ADMIN"
  if (ctx.memberships.some((m) => m.role === "ACADEMY_ADMIN")) return "ADMIN"
  if (ctx.memberships.some((m) => m.role === "COURSE_DEVELOPER")) return "INSTRUCTOR"
  return "STUDENT"
}
