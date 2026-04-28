import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"
import { UserMenu } from "@/components/layout/user-menu"

export default async function LearnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login?callbackUrl=/learner")
  }

  // Spec §5.2 tabs. /my-courses and /certificates already exist, so the
  // learner dashboard links out to those rather than duplicating screens.
  // iconName strings (not LucideIcon refs) so the array survives the
  // Server→Client serialisation into RoleSidebar.
  const items: RoleSidebarItem[] = [
    { href: "/learner", iconName: "LayoutDashboard", label: "Dashboard", matchExact: true },
    { href: "/learner/complimentary", iconName: "Gift", label: "Complimentary" },
    { href: "/my-courses", iconName: "BookOpen", label: "My Courses" },
    { href: "/learner/programmes", iconName: "Layers", label: "My Programmes" },
    { href: "/certificates", iconName: "Award", label: "Certificates" },
    { href: "/learner/invoices", iconName: "Receipt", label: "Invoices & Receipts" },
    { href: "/learner/profile", iconName: "UserCircle", label: "Profile" },
  ]

  return (
    <div className="flex min-h-screen">
      <RoleSidebar rootHref="/learner" roleLabel="Learner" items={items} />
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="hidden md:flex items-center justify-end gap-4 px-6 py-3">
          <UserMenu user={JSON.parse(JSON.stringify(session.user))} />
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
