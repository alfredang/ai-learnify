import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import type { RoleSidebarItem } from "@/components/layout/role-sidebar"
import { LearnerShell } from "@/components/layout/learner-shell"

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const items: RoleSidebarItem[] = [
    { href: "/learner/complimentary", iconName: "Gift", label: "Complimentary Programme", matchExact: true },
    { href: "/my-courses", iconName: "BookOpen", label: "E-Courses" },
    { href: "/learner/programmes", iconName: "Layers", label: "My Programmes" },
    { href: "/certificates", iconName: "Award", label: "Certificates" },
    { href: "/learner/invoices", iconName: "Receipt", label: "Invoices & Receipts" },
    { href: "/learner/profile", iconName: "UserCircle", label: "Profile" },
  ]

  return <LearnerShell items={items}>{children}</LearnerShell>
}
