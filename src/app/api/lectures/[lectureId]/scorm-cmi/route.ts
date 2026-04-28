import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { audit, getRequestIp } from "@/lib/audit"

/**
 * SCORM 1.2 / 2004 CMI persistence.
 *
 *   GET  → restore the learner's CMI bag for the lecture (suspend_data,
 *          lesson_status, score.raw, etc.) so the SCO can resume.
 *   POST → commit a CMI snapshot from scorm-again. The body is a flat
 *          key/value object the runtime produced. Server-side we also
 *          peek at lesson_status / completion_status / success_status to
 *          infer auto-completion (spec §7.1) — once the SCO reports
 *          passed/completed, we mark `LectureProgress.isCompleted = true`
 *          so the certification engine can pick up the lecture.
 *
 * The endpoint is enrolment-gated and 90-day-access-gated, same as the
 * generic progress endpoint.
 */

const COMPLETION_KEYS = [
  "cmi.core.lesson_status", // SCORM 1.2
  "cmi.completion_status", // SCORM 2004
  "cmi.success_status", // SCORM 2004
]
const COMPLETED_VALUES = new Set(["passed", "completed"])

async function loadLectureContext(lectureId: string, userId: string) {
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: {
      section: {
        include: {
          course: {
            include: {
              enrollments: { where: { userId } },
            },
          },
        },
      },
    },
  })
  if (!lecture) return { ok: false as const, status: 404, error: "Lecture not found" }
  const enrollment = lecture.section.course.enrollments[0]
  if (!enrollment) {
    return { ok: false as const, status: 403, error: "Not enrolled" }
  }
  const access = await checkCourseAccess(userId, lecture.section.course.id)
  if (!access.allowed) {
    return {
      ok: false as const,
      status: access.reason === "EXPIRED" ? 410 : 403,
      error:
        access.reason === "EXPIRED"
          ? "Your access window for this course has expired."
          : "You do not have access to this course.",
    }
  }
  return { ok: true as const, lecture, courseId: lecture.section.course.id }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { lectureId } = await params
  const ctx = await loadLectureContext(lectureId, session.user.id)
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }

  const progress = await prisma.lectureProgress.findUnique({
    where: { userId_lectureId: { userId: session.user.id, lectureId } },
    select: { cmiData: true, isCompleted: true },
  })

  return NextResponse.json({
    cmiData: progress?.cmiData ?? null,
    isCompleted: progress?.isCompleted ?? false,
  })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { lectureId } = await params
  const ctx = await loadLectureContext(lectureId, session.user.id)
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body must be an object" }, { status: 400 })
  }
  const cmi = body as Record<string, unknown>

  // Cap payload size — SCORM bags can grow with suspend_data, but 64 KB
  // is far above any reasonable real-world CMI snapshot.
  const json = JSON.stringify(cmi)
  if (json.length > 64 * 1024) {
    return NextResponse.json(
      { error: "CMI payload too large (>64KB)" },
      { status: 413 }
    )
  }

  // Decide if the SCO has reported the lecture as complete.
  const completedFromScorm = COMPLETION_KEYS.some((k) => {
    const v = cmi[k]
    return typeof v === "string" && COMPLETED_VALUES.has(v.toLowerCase())
  })

  const existing = await prisma.lectureProgress.findUnique({
    where: { userId_lectureId: { userId: session.user.id, lectureId } },
    select: { isCompleted: true },
  })

  const shouldMarkComplete = completedFromScorm && !existing?.isCompleted

  await prisma.lectureProgress.upsert({
    where: { userId_lectureId: { userId: session.user.id, lectureId } },
    create: {
      userId: session.user.id,
      lectureId,
      cmiData: cmi as object,
      isCompleted: completedFromScorm,
      ...(completedFromScorm ? { completedAt: new Date() } : {}),
    },
    update: {
      cmiData: cmi as object,
      ...(shouldMarkComplete ? { isCompleted: true, completedAt: new Date() } : {}),
    },
  })

  if (shouldMarkComplete) {
    await audit({
      action: "lecture.scorm.completed",
      resourceType: "lecture",
      resourceId: lectureId,
      userId: session.user.id,
      metadata: {
        courseId: ctx.courseId,
        lessonStatus:
          (cmi["cmi.core.lesson_status"] as string | undefined) ??
          (cmi["cmi.completion_status"] as string | undefined),
        score:
          (cmi["cmi.core.score.raw"] as string | undefined) ??
          (cmi["cmi.score.raw"] as string | undefined),
      },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })
  }

  return NextResponse.json({
    ok: true,
    autoCompleted: shouldMarkComplete,
  })
}
