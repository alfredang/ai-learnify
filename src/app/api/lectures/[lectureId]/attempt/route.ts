import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { maybeIssueCertificate } from "@/lib/certification"
import { audit } from "@/lib/audit"

const schema = z.object({
  pointsEarned: z.number().min(0),
  maxPoints: z.number().positive(),
  answersJson: z.record(z.string(), z.unknown()),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { lectureId } = await params
  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    include: {
      section: {
        select: {
          course: { select: { id: true, assessmentPassMark: true, retakesAllowed: true } },
        },
      },
    },
  })

  if (!lecture || lecture.type !== "QUIZ") {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 })
  }

  const courseId = lecture.section.course.id

  // Phase 3: enforce access window even on quiz submission.
  const access = await checkCourseAccess(session.user.id, courseId)
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Access denied", code: access.reason },
      { status: access.reason === "EXPIRED" ? 410 : 403 }
    )
  }

  // Retake cap: -1 = unlimited, 0 = none, >0 = limit.
  const retakesAllowed = lecture.section.course.retakesAllowed ?? -1
  const existingCount = await prisma.assessmentAttempt.count({
    where: { userId: session.user.id, lectureId },
  })
  if (retakesAllowed >= 0 && existingCount >= 1 + retakesAllowed) {
    return NextResponse.json(
      { error: "Retake limit reached", code: "RETAKE_LIMIT" },
      { status: 409 }
    )
  }

  const { pointsEarned, maxPoints, answersJson } = parsed.data
  const scorePct = maxPoints > 0 ? Math.round((pointsEarned / maxPoints) * 10000) / 100 : 0
  const passMark = lecture.section.course.assessmentPassMark ?? 80
  const passed = scorePct >= passMark

  const attempt = await prisma.assessmentAttempt.create({
    data: {
      lectureId,
      userId: session.user.id,
      attemptNumber: existingCount + 1,
      scorePct,
      pointsEarned,
      maxPoints,
      passed,
      answersJson: answersJson as Prisma.InputJsonValue,
    },
  })

  await audit({
    action: "assessment.submit",
    resourceType: "assessmentAttempt",
    resourceId: attempt.id,
    userId: session.user.id,
    metadata: { courseId, lectureId, scorePct, passed },
  })

  // If passing changed eligibility, try issuing the cert.
  let certIssued: { id: string; certificateId: string } | null = null
  if (passed) {
    const res = await maybeIssueCertificate(session.user.id, courseId)
    if (res.issued && res.certificate) {
      certIssued = {
        id: res.certificate.id,
        certificateId: res.certificate.certificateId,
      }
    }
  }

  return NextResponse.json({
    attempt: {
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      scorePct,
      passed,
    },
    certIssued,
  })
}
