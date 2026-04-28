import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * Spec §13 — CPD picker for the course editor. Returns the academy's
 * CPD catalog so a course developer can attach a CPD entry to their
 * course without needing ACADEMY_ADMIN role on /api/academy/cpd-catalog.
 *
 * Auth mirrors GET /api/courses/[id]: course owner or ADMIN.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "AUTH_REQUIRED" },
      { status: 401 }
    )
  }

  const { id } = await params
  const course = await prisma.course.findUnique({
    where: { id },
    select: { instructorId: true, academyId: true },
  })

  if (!course) {
    return NextResponse.json(
      { error: "Course not found", code: "COURSE_NOT_FOUND" },
      { status: 404 }
    )
  }

  if (course.instructorId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "You do not own this course", code: "NOT_COURSE_OWNER" },
      { status: 403 }
    )
  }

  if (!course.academyId) {
    return NextResponse.json({ entries: [] })
  }

  const entries = await prisma.cpdCatalog.findMany({
    where: { academyId: course.academyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, points: true },
  })

  return NextResponse.json({ entries })
}
