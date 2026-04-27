import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"
import { UserMenu } from "@/components/layout/user-menu"

export default async function AcademyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/academy")

  const isAdmin = session.user.memberships?.some((m) => m.role === "ACADEMY_ADMIN")
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  if (!isAdmin && !isOwner) redirect("/")

  const items: RoleSidebarItem[] = [
    { href: "/academy", iconName: "LayoutDashboard", label: "Dashboard", matchExact: true },
    { href: "/academy/branding", iconName: "Image", label: "Branding" },
    { href: "/academy/courses", iconName: "BookOpen", label: "Catalogue" },
    { href: "/academy/learners", iconName: "Users", label: "Learners" },
    { href: "/academy/marketers", iconName: "Megaphone", label: "Marketers" },
    { href: "/academy/audit", iconName: "ScrollText", label: "Audit Log" },
    { href: "/academy/settings", iconName: "Settings", label: "Settings" },
  ]

  return (
    <div className="flex min-h-screen">
      <RoleSidebar rootHref="/academy" roleLabel="Academy Admin" items={items} />
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="hidden md:flex items-center justify-end gap-4 px-6 py-3">
          <UserMenu user={JSON.parse(JSON.stringify(session.user))} />
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
