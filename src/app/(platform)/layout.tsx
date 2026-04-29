import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"

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
        { href: "/platform/policy", iconName: "Sliders", label: "Policy" },
        { href: "/platform/promos", iconName: "Tag", label: "Promo codes" },
        { href: "/platform/integrity", iconName: "CheckCircle2", label: "Ledger integrity" },
        { href: "/platform/users", iconName: "Users", label: "Users & Roles" },
        { href: "/platform/audit", iconName: "ScrollText", label: "Audit log" },
        { href: "/platform/ops", iconName: "Activity", label: "Operations" },
      ]
    : [
        { href: "/platform/ops", iconName: "Activity", label: "Operations", matchExact: true },
        { href: "/platform/ops/earnings", iconName: "Wallet", label: "Earnings" },
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
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
