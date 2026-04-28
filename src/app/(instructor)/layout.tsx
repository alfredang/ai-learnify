import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { InstructorSidebar } from "@/components/layout/instructor-sidebar"

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

  return (
    <div className="flex min-h-screen">
      <InstructorSidebar />
      <div className="flex-1 flex flex-col overflow-auto">
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
