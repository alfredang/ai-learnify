import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listCourseVersions, snapshotCourse } from "@/lib/course-versions"

/**
 * Phase 6 — Spec §7.2: course version history.
 *
 * GET  /api/courses/[id]/versions   list (newest first)
 * POST /api/courses/[id]/versions   force a new snapshot (admin / author)
 *
 * Note: published snapshots are auto-created in the course PUT handler
 * when status transitions to PUBLISHED. The POST here exists for manual
 * re-snapshots (e.g. after a batch edit the author wants to freeze).
 */

async function assertCourseAuthor(
  session: Awaited<ReturnType<typeof auth>>,
  courseId: string
) {
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized" }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, academyId: true, instructorId: true },
  })
  if (!course) return { ok: false as const, status: 404, error: "Course not found" }
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === course.academyId && m.role === "ACADEMY_ADMIN"
  )
  const isAuthor = course.instructorId === session.user.id
  if (!(isOwner || isAdmin || isAuthor)) {
    return { ok: false as const, status: 403, error: "Forbidden" }
  }
  return { ok: true as const, course }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id: courseId } = await params
  const authz = await assertCourseAuthor(session, courseId)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const versions = await listCourseVersions(courseId)
  return NextResponse.json({ versions })
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id: courseId } = await params
  const authz = await assertCourseAuthor(session, courseId)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  try {
    const version = await snapshotCourse(courseId, session!.user.id)
    return NextResponse.json({ version }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Snapshot failed" },
      { status: 500 }
    )
  }
}
