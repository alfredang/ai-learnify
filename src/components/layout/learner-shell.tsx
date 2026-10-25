"use client"

import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"
import { LearnerMobileNav } from "@/components/layout/learner-mobile-nav"

/** Lecture player routes run in focus mode: no dashboard chrome. */
const FOCUS_ROUTE = /^\/my-courses\/[^/]+\/lectures\//

export function LearnerShell({
  items,
  children,
}: {
  items: RoleSidebarItem[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const focus = FOCUS_ROUTE.test(pathname ?? "")

  return (
    <div className={cn("flex min-h-screen", !focus && "pb-14 md:pb-0")}>
      {!focus && <RoleSidebar rootHref="/learner" roleLabel="Learner" items={items} />}
      <div className="flex min-w-0 flex-1 flex-col overflow-auto">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      {!focus && <LearnerMobileNav />}
    </div>
  )
}
