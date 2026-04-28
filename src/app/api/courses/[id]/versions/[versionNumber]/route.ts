import { NextResponse } from "next/server"
import type { Session } from "next-auth"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCourseVersion } from "@/lib/course-versions"

async function assertCourseAuthor(session: Session | null, courseId: string) {
  if (!session?.user) {
    return { ok: false as const, status: 401, error: "Unauthorized" }
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, academyId: true, instructorId: true },
  })
  if (!course) {
    return { ok: false as const, status: 404, error: "Course not found" }
  }
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === course.academyId && m.role === "ACADEMY_ADMIN"
  )
  const isAuthor = course.instructorId === session.user.id
  if (!(isOwner || isAdmin || isAuthor)) {
    return { ok: false as const, status: 403, error: "Forbidden" }
  }
  return { ok: true as const }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionNumber: string }> }
) {
  const session = await auth()
  const { id: courseId, versionNumber } = await params
  const authz = await assertCourseAuthor(session, courseId)
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status })
  }
  const n = parseInt(versionNumber)
  if (Number.isNaN(n)) {
    return NextResponse.json({ error: "Invalid version number" }, { status: 400 })
  }
  const version = await getCourseVersion(courseId, n)
  if (!version) {
    return NextResponse.json({ error: "Version not found" }, { status: 404 })
  }
  return NextResponse.json({ version })
}
