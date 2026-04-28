"use client"

import { RoleSwitcher } from "./role-switcher"
import { HeaderDateTime } from "./header-datetime"
import { UserMenu } from "./user-menu"
import type { UserRole } from "@prisma/client"

interface DashboardTopBarProps {
  user: {
    id: string
    name?: string | null
    email?: string | null
    image?: string | null
    role: UserRole
  }
  platformRole: string
  memberships: { academyId: string; role: string }[]
}

export function DashboardTopBar({ user, platformRole, memberships }: DashboardTopBarProps) {
  return (
    <div className="hidden md:flex items-center justify-end gap-4 px-6 py-3 border-b bg-white">
      <RoleSwitcher platformRole={platformRole} memberships={memberships} legacyRole={user.role} />
      <HeaderDateTime />
      <UserMenu user={user} />
    </div>
  )
}
