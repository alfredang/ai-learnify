import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { RoleSidebar, type RoleSidebarItem } from "@/components/layout/role-sidebar"

export default async function LearnerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login?callbackUrl=/learner")
  }

  const items: RoleSidebarItem[] = [
    { href: "/learner/complimentary", iconName: "Gift", label: "Complimentary Programme", matchExact: true },
    { href: "/my-courses", iconName: "BookOpen", label: "E-Courses" },
    { href: "/learner/programmes", iconName: "Layers", label: "My Programmes" },
    { href: "/certificates", iconName: "Award", label: "Certificates" },
    { href: "/learner/invoices", iconName: "Receipt", label: "Invoices & Receipts" },
    { href: "/learner/profile", iconName: "UserCircle", label: "Profile" },
  ]

  return (
    <div className="flex min-h-screen">
      <RoleSidebar rootHref="/learner" roleLabel="Learner" items={items} />
      <div className="flex-1 flex flex-col overflow-auto">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
