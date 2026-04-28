"use client"

import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Check, Eye } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getAvailableRoles, detectActiveRole, VIEW_AS_ROLES, type ViewAsRole } from "@/lib/role-utils"

interface RoleSwitcherProps {
  platformRole: string
  memberships: { academyId: string; role: string }[]
  legacyRole?: string
}

export function RoleSwitcher({ platformRole, memberships, legacyRole }: RoleSwitcherProps) {
  const pathname = usePathname()
  const router = useRouter()

  const availableRoles = getAvailableRoles(platformRole, memberships, legacyRole)
  const activeRole = detectActiveRole(pathname)
  const activeLabel = VIEW_AS_ROLES[activeRole]?.label ?? "Learner"

  if (availableRoles.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium bg-white">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span>View As:</span>
        <span className="font-semibold">{activeLabel}</span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium bg-white hover:bg-muted/50 transition-colors cursor-pointer">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span>View As:</span>
          <span className="font-semibold">{activeLabel}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Switch Role
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableRoles.map((role) => {
          const { label, route } = VIEW_AS_ROLES[role]
          const isActive = role === activeRole
          return (
            <DropdownMenuItem
              key={role}
              onClick={() => {
                if (!isActive) router.push(route)
              }}
              className={isActive ? "bg-muted/50 font-semibold" : "cursor-pointer"}
            >
              <span className="flex-1">{label}</span>
              {isActive && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
