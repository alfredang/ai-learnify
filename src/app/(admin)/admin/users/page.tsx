import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { UsersTable } from "./users-table"

export const metadata: Metadata = {
  title: "User Management",
  description: "Manage platform users",
}

async function getUsers() {
  try {
    return await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        platformRole: true,
        createdAt: true,
        academyMemberships: {
          select: {
            academyId: true,
            role: true,
            academy: { select: { id: true, name: true, slug: true } },
          },
        },
        _count: {
          select: { courses: true, enrollments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })
  } catch (error) {
    console.error("Failed to fetch users:", error)
    return []
  }
}

async function getAcademies() {
  try {
    return await prisma.academy.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    })
  } catch {
    return []
  }
}

export default async function AdminUsersPage() {
  const [session, users, academies] = await Promise.all([
    auth(),
    getUsers(),
    getAcademies(),
  ])

  // Edit affordances are surfaced only to Platform Owners. Other admins
  // see the table read-only — the API enforces the same gate, so even
  // direct calls from non-owners would 403.
  const canEditRoles = session?.user?.platformRole === "PLATFORM_OWNER"

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground">
          View and manage all platform users
          {canEditRoles && (
            <> — click <span className="font-medium">Edit roles</span> on any
            row to change a user&apos;s Platform and Academy roles.</>
          )}
        </p>
      </div>

      <UsersTable
        users={JSON.parse(JSON.stringify(users))}
        academies={academies}
        canEditRoles={canEditRoles}
        currentUserId={session?.user?.id ?? ""}
      />
    </div>
  )
}
