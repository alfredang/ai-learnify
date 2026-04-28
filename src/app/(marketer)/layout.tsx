import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"
import { DashboardTopBar } from "@/components/layout/dashboard-topbar"

export default async function MarketerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/marketer")

  const isMarketer = session.user.memberships?.some((m) => m.role === "MARKETER")
  const isAdmin = session.user.memberships?.some((m) => m.role === "ACADEMY_ADMIN")
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  if (!isMarketer && !isAdmin && !isOwner) redirect("/")

  const items: RoleSidebarItem[] = [
    { href: "/marketer", iconName: "LayoutDashboard", label: "Performance", matchExact: true },
  ]

  const serializedUser = JSON.parse(JSON.stringify(session.user))

  return (
    <div className="flex min-h-screen">
      <RoleSidebar rootHref="/marketer" roleLabel="Marketer" items={items} />
      <div className="flex-1 flex flex-col overflow-auto">
        <DashboardTopBar
          user={serializedUser}
          platformRole={serializedUser.platformRole ?? "NONE"}
          memberships={serializedUser.memberships ?? []}
        />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
