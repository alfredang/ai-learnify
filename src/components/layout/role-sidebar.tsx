"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import {
  LayoutDashboard,
  Gift,
  BookOpen,
  Layers,
  Award,
  Receipt,
  UserCircle,
  Image as ImageIcon,
  Users,
  Megaphone,
  ScrollText,
  Settings as SettingsIcon,
  Sliders,
  Activity,
  DollarSign,
  type LucideIcon,
} from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Server Components can't pass function references (i.e. LucideIcon
// component objects) across the Server→Client boundary because props
// are serialised as JSON. Each role layout passes a string `iconName`
// here instead and we resolve it from this static registry. Adding a
// new icon = add it here AND export the name in RoleSidebarIconName.
const ICONS = {
  LayoutDashboard,
  Gift,
  BookOpen,
  Layers,
  Award,
  Receipt,
  UserCircle,
  Image: ImageIcon,
  Users,
  Megaphone,
  ScrollText,
  Settings: SettingsIcon,
  Sliders,
  Activity,
  DollarSign,
} satisfies Record<string, LucideIcon>

export type RoleSidebarIconName = keyof typeof ICONS

export type RoleSidebarItem = {
  href: string
  iconName: RoleSidebarIconName
  label: string
  // Exact-match routes (like role root) should use matchExact so the active
  // highlight doesn't stick to a parent when a child is shown.
  matchExact?: boolean
}

interface RoleSidebarProps {
  /** Root href of this role (used for brand link target) */
  rootHref: string
  /** Short role label shown when expanded (e.g. "Academy Admin") */
  roleLabel: string
  items: RoleSidebarItem[]
}

/**
 * Phase 8: generic collapsed-by-default sidebar reused across the six role
 * dashboards. Expands on hover. Mirrors the pattern already shipped in
 * InstructorSidebar so all role workspaces feel consistent.
 */
export function RoleSidebar({ rootHref, roleLabel, items }: RoleSidebarProps) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)

  const isActive = (item: RoleSidebarItem) => {
    if (item.matchExact) return pathname === item.href
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        className={cn(
          "hidden md:flex flex-col border-r bg-background transition-all duration-200 ease-in-out",
          expanded ? "w-[280px]" : "w-[68px]"
        )}
      >
        <div className="flex items-center h-14 px-4 border-b">
          <Link href={rootHref} className="flex items-center gap-2">
            <svg
              width="24"
              height="24"
              viewBox="0 0 28 28"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="shrink-0"
            >
              <circle cx="14" cy="14" r="14" className="fill-foreground" />
              <path d="M8.5 19L14 7.5L19.5 19H8.5Z" className="fill-background" />
            </svg>
            {expanded && (
              <span className="text-sm font-bold whitespace-nowrap overflow-hidden">
                {roleLabel}
              </span>
            )}
          </Link>
        </div>

        <nav className="flex-1 py-4 space-y-1">
          {items.map((item) => {
            const active = isActive(item)
            const Icon = ICONS[item.iconName]
            const linkContent = (
              <Link
                href={item.href}
                className={cn(
                  "flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {expanded && (
                  <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
                )}
              </Link>
            )
            if (expanded) {
              return <div key={item.href}>{linkContent}</div>
            }
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </nav>
      </aside>
    </TooltipProvider>
  )
}
