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
      <div className="flex items-center gap-3">
        {user.image ? (
          <img
            src={user.image}
            alt={user.name ?? "Profile"}
            className="w-9 h-9 rounded-full object-cover ring-2 ring-offset-1 ring-primary"
          />
        ) : null}
        <HeaderDateTime />
      </div>
      <UserMenu user={user} />
    </div>
  )
}
