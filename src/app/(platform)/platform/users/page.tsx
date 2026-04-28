import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UsersManager } from "./users-manager"

export const metadata: Metadata = {
  title: "Users & Roles",
  description: "Assign platform and academy roles",
}

export default async function PlatformUsersPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform/users")
  // Spec §1 — only Platform Owners may assign roles.
  if (session.user.platformRole !== "PLATFORM_OWNER") redirect("/")

  const [users, academies] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        platformRole: true,
        academyMemberships: {
          select: {
            academyId: true,
            role: true,
            academy: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      take: 200,
    }),
    prisma.academy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
  ])

  return (
    <div className="container py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Users &amp; Roles</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Assign the global Platform role and per-academy memberships. Only
          Platform Owners can make these changes.
        </p>
      </div>
      <UsersManager
        users={JSON.parse(JSON.stringify(users))}
        academies={academies}
        currentUserId={session.user.id}
      />
    </div>
  )
}
