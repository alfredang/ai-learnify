import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { maybeIssueCertificate } from "@/lib/certification"
import { audit } from "@/lib/audit"

// Public GET — returns the survey questions (no auth required since they
// may be displayed on the public detail page per spec §7.4).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const survey = await prisma.survey.findUnique({
    where: { courseId: id },
    select: { id: true, title: true, description: true, questionsJson: true, isMandatoryForCert: true },
  })

  if (!survey) return NextResponse.json({ survey: null })

  return NextResponse.json({ survey })
}

const submitSchema = z.object({
  starRating: z.number().int().min(1).max(5),
  answersJson: z.record(z.string(), z.unknown()).default({}),
})

// Spec §7.4: survey is mandatory for certification but authored by the
// Course Developer. These schemas govern the author-side PUT/DELETE below.
const surveyQuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1).max(500),
  type: z.enum(["text", "rating", "single_choice", "multi_choice"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
})

const upsertSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  isMandatoryForCert: z.boolean().optional(),
  questions: z.array(surveyQuestionSchema).max(30).optional(),
})

async function assertCourseAuthor(
  session: Awaited<ReturnType<typeof auth>>,
  courseId: string
): Promise<{ ok: true; course: { id: string; academyId: string | null; instructorId: string } } | { ok: false; status: number; error: string }> {
  if (!session?.user) return { ok: false, status: 401, error: "Unauthorized" }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, academyId: true, instructorId: true },
  })
  if (!course) return { ok: false, status: 404, error: "Course not found" }

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAcademyAdmin = session.user.memberships?.some(
    (m) => m.academyId === course.academyId && m.role === "ACADEMY_ADMIN"
  )
  const isDeveloper = session.user.memberships?.some(
    (m) => m.academyId === course.academyId && m.role === "COURSE_DEVELOPER"
  )
  const isLegacyInstructor = course.instructorId === session.user.id
  if (!(isOwner || isAcademyAdmin || (isDeveloper && isLegacyInstructor) || isLegacyInstructor)) {
    return { ok: false, status: 403, error: "Forbidden" }
  }
  return { ok: true, course }
}

/**
 * PUT /api/courses/[id]/survey — author upsert. Creates the Survey row if
 * missing, updates title / description / questions / mandatoryForCert.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id: courseId } = await params
  const authz = await assertCourseAuthor(session, courseId)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const parsed = upsertSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data

  const existing = await prisma.survey.findUnique({ where: { courseId } })

  const data = {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.isMandatoryForCert !== undefined
      ? { isMandatoryForCert: input.isMandatoryForCert }
      : {}),
    ...(input.questions !== undefined
      ? { questionsJson: { version: 1, questions: input.questions } as Prisma.InputJsonValue }
      : {}),
  }

  const survey = existing
    ? await prisma.survey.update({ where: { courseId }, data })
    : await prisma.survey.create({
        data: {
          courseId,
          title: input.title ?? "Course survey",
          description: input.description ?? null,
          isMandatoryForCert: input.isMandatoryForCert ?? true,
          questionsJson: {
            version: 1,
            questions: input.questions ?? [],
          } as Prisma.InputJsonValue,
        },
      })

  await audit({
    action: existing ? "survey.update" : "survey.create",
    resourceType: "survey",
    resourceId: survey.id,
    userId: session!.user.id,
    academyId: authz.course.academyId,
    metadata: {
      courseId,
      questionCount: Array.isArray(input.questions) ? input.questions.length : undefined,
    },
  })

  return NextResponse.json({ survey })
}

/**
 * DELETE /api/courses/[id]/survey — author removal. Cascades survey
 * responses (schema rule). Use sparingly; preferable to edit instead.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const { id: courseId } = await params
  const authz = await assertCourseAuthor(session, courseId)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  const survey = await prisma.survey.findUnique({
    where: { courseId },
    select: { id: true },
  })
  if (!survey) return NextResponse.json({ ok: true })

  await prisma.survey.delete({ where: { courseId } })

  await audit({
    action: "survey.delete",
    resourceType: "survey",
    resourceId: survey.id,
    userId: session!.user.id,
    academyId: authz.course.academyId,
    metadata: { courseId },
  })

  return NextResponse.json({ ok: true })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: courseId } = await params
  const parsed = submitSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const access = await checkCourseAccess(session.user.id, courseId)
  if (!access.allowed) {
    return NextResponse.json(
      { error: "Access denied", code: access.reason },
      { status: access.reason === "EXPIRED" ? 410 : 403 }
    )
  }

  let survey = await prisma.survey.findUnique({ where: { courseId } })
  // If no survey exists yet, create a minimal one so we can still collect a
  // star rating (spec §6 step 5 wants every completion to yield a rating).
  if (!survey) {
    survey = await prisma.survey.create({
      data: {
        courseId,
        title: "Course feedback",
        description: "Please rate your experience.",
        questionsJson: { version: 1, questions: [] },
        isMandatoryForCert: true,
      },
    })
  }

  const answersJson = parsed.data.answersJson as Prisma.InputJsonValue
  const response = await prisma.surveyResponse.upsert({
    where: { surveyId_userId: { surveyId: survey.id, userId: session.user.id } },
    create: {
      surveyId: survey.id,
      userId: session.user.id,
      starRating: parsed.data.starRating,
      answersJson,
    },
    update: {
      starRating: parsed.data.starRating,
      answersJson,
      submittedAt: new Date(),
    },
  })

  await audit({
    action: "survey.submit",
    resourceType: "surveyResponse",
    resourceId: response.id,
    userId: session.user.id,
    metadata: { courseId, starRating: parsed.data.starRating },
  })

  // Surveys unlock certs, so try to issue on submit.
  const certRes = await maybeIssueCertificate(session.user.id, courseId)

  return NextResponse.json({
    responseId: response.id,
    certIssued: certRes.issued
      ? { id: certRes.certificate?.id, certificateId: certRes.certificate?.certificateId }
      : null,
    eligibility: certRes.eligibility ?? null,
  })
}
