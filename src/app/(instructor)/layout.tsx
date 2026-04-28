import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { InstructorSidebar } from "@/components/layout/instructor-sidebar"
import { DashboardTopBar } from "@/components/layout/dashboard-topbar"

export default async function InstructorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  if (!session?.user) {
    redirect("/login?callbackUrl=/instructor")
  }

  if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
    redirect("/become-instructor")
  }

  const serializedUser = JSON.parse(JSON.stringify(session.user))

  return (
    <div className="flex min-h-screen">
      <InstructorSidebar />
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
