import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"
import { UserMenu } from "@/components/layout/user-menu"
import { Shield } from "lucide-react"

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform")

  const pr = session.user.platformRole
  if (pr !== "PLATFORM_OWNER" && pr !== "PLATFORM_SUPPORT") {
    redirect("/")
  }

  const isOwner = pr === "PLATFORM_OWNER"

  // Platform Support has a narrower menu (spec §7).
  const items: RoleSidebarItem[] = isOwner
    ? [
        { href: "/platform", iconName: "LayoutDashboard", label: "Dashboard", matchExact: true },
        { href: "/platform/audit", iconName: "ScrollText", label: "Audit log" },
        { href: "/platform/policy", iconName: "Sliders", label: "Policy" },
        { href: "/platform/ops", iconName: "Activity", label: "Operations" },
      ]
    : [
        { href: "/platform/ops", iconName: "Activity", label: "Operations", matchExact: true },
        { href: "/platform/ops/audit", iconName: "ScrollText", label: "Audit log" },
      ]

  return (
    <div className="flex min-h-screen">
      <RoleSidebar
        rootHref={isOwner ? "/platform" : "/platform/ops"}
        roleLabel={isOwner ? "Platform Owner" : "Platform Support"}
        items={items}
      />
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="hidden md:flex items-center justify-end gap-4 px-6 py-3">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            {isOwner ? "Owner" : "Support"}
          </span>
          <UserMenu user={JSON.parse(JSON.stringify(session.user))} />
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
