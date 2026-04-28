"use client"

import { useRef, useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ChevronDown, Check, Eye } from "lucide-react"
import { getAvailableRoles, detectActiveRole, VIEW_AS_ROLES, type ViewAsRole } from "@/lib/role-utils"

const ROLE_EMOJI: Record<ViewAsRole, string> = {
  "platform-owner": "🏢",
  "platform-support": "⚙️",
  "academy-admin": "🎓",
  "course-developer": "💻",
  "marketer": "💰",
  "learner": "📚",
}

interface RoleSwitcherProps {
  platformRole: string
  memberships: { academyId: string; role: string }[]
  legacyRole?: string
}

export function RoleSwitcher({ platformRole, memberships, legacyRole }: RoleSwitcherProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const availableRoles = getAvailableRoles(platformRole, memberships, legacyRole)
  const activeRole = detectActiveRole(pathname)
  const activeLabel = VIEW_AS_ROLES[activeRole]?.label ?? "Learner"

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  if (availableRoles.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium bg-white">
        <Eye className="h-4 w-4 text-muted-foreground" />
        <span className="hidden md:inline text-muted-foreground text-xs">View As:</span>
        <span className="font-semibold">{activeLabel}</span>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium bg-white hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <Eye className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="hidden md:inline text-muted-foreground text-xs">View As:</span>
        <span className="font-semibold truncate max-w-[180px]">{activeLabel}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-60 bg-white rounded-lg shadow-2xl border z-50">
          <div className="px-3 py-2 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Switch Role
            </p>
          </div>
          <div className="p-2">
            {availableRoles.map((role) => {
              const { label, route } = VIEW_AS_ROLES[role]
              const isActive = role === activeRole
              return (
                <button
                  key={role}
                  onClick={() => {
                    router.push(route)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-md transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <span className="text-lg">{ROLE_EMOJI[role]}</span>
                  <span className="flex-1 text-left">{label}</span>
                  {isActive && <Check className="h-4 w-4 text-primary flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
