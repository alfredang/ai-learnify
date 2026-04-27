import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { maybeIssueCertificate } from "@/lib/certification"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: "You must be logged in to track progress", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    const { lectureId } = await params
    const body = await request.json()
    const { isCompleted, watchedDuration, lastPosition } = body

    // Verify lecture exists and user is enrolled in the course
    const lecture = await prisma.lecture.findUnique({
      where: { id: lectureId },
      include: {
        section: {
          include: {
            course: {
              include: {
                enrollments: {
                  where: { userId: session.user.id },
                },
                instructor: {
                  select: { name: true },
                },
                sections: {
                  include: {
                    lectures: {
                      select: { id: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!lecture) {
      return NextResponse.json(
        { error: "Lecture not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    const enrollment = lecture.section.course.enrollments[0]
    if (!enrollment) {
      return NextResponse.json(
        { error: "You are not enrolled in this course", code: "FORBIDDEN" },
        { status: 403 }
      )
    }

    // Phase 3: enforce 90-day AccessGrant window (spec §11.1). Content
    // auto-locks after expiry — the viewer UI shows a lock, this endpoint
    // hard-blocks progress writes.
    const access = await checkCourseAccess(session.user.id, lecture.section.course.id)
    if (!access.allowed) {
      return NextResponse.json(
        {
          error:
            access.reason === "EXPIRED"
              ? "Your 90-day access window for this course has expired."
              : "You do not have access to this course.",
          code: access.reason,
        },
        { status: access.reason === "EXPIRED" ? 410 : 403 }
      )
    }

    // Upsert lecture progress
    const progress = await prisma.lectureProgress.upsert({
      where: {
        userId_lectureId: {
          userId: session.user.id,
          lectureId,
        },
      },
      update: {
        ...(isCompleted !== undefined && {
          isCompleted,
          completedAt: isCompleted ? new Date() : null,
        }),
        ...(watchedDuration !== undefined && { watchedDuration }),
        ...(lastPosition !== undefined && { lastPosition }),
      },
      create: {
        userId: session.user.id,
        lectureId,
        isCompleted: isCompleted ?? false,
        watchedDuration: watchedDuration ?? 0,
        lastPosition: lastPosition ?? 0,
        completedAt: isCompleted ? new Date() : null,
      },
    })

    // Recalculate overall course enrollment progress
    const course = lecture.section.course
    const totalLectures = course.sections.reduce(
      (acc, s) => acc + s.lectures.length,
      0
    )

    const completedCount = await prisma.lectureProgress.count({
      where: {
        userId: session.user.id,
        isCompleted: true,
        lecture: {
          section: {
            courseId: course.id,
          },
        },
      },
    })

    const newProgress = totalLectures > 0
      ? Math.round((completedCount / totalLectures) * 100)
      : 0

    const justCompleted = newProgress === 100 && !enrollment.completedAt

    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        progress: newProgress,
        lastAccessedAt: new Date(),
        ...(justCompleted ? { completedAt: new Date() } : {}),
      },
    })

    // Phase 5: rule-based certification (spec §12). Replaces the old
    // "hit 100% → auto-cert" flow with the configurable CertificateRule
    // engine. The engine is idempotent and runs on every progress update
    // so the cert is issued the moment all gates (content %, assessment %,
    // survey, access window) are satisfied.
    const certRes = await maybeIssueCertificate(session.user.id, course.id)
    const certificateGenerated = certRes.issued

    return NextResponse.json({
      progress,
      courseProgress: newProgress,
      courseCompleted: justCompleted,
      certificateGenerated,
      certificate: certRes.issued
        ? { id: certRes.certificate?.id, certificateId: certRes.certificate?.certificateId }
        : null,
    })
  } catch (error) {
    console.error("[LECTURE_PROGRESS_UPDATE]", error)
    return NextResponse.json(
      { error: "Failed to update progress", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
