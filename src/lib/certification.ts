import { nanoid } from "nanoid"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { checkCourseAccess } from "@/lib/access"

export type CertEligibility = {
  eligible: boolean
  reason?:
    | "NO_ACCESS"
    | "EXPIRED"
    | "NOT_PAID"
    | "CONTENT_INCOMPLETE"
    | "ASSESSMENT_FAIL"
    | "SURVEY_MISSING"
    | "ALREADY_ISSUED"
  contentPct: number
  assessmentPct: number | null
  surveyDone: boolean
  rule: {
    minContentPct: number
    minAssessmentPct: number
    requiresSurvey: boolean
    mustBeBeforeExpiry: boolean
  }
}

/**
 * Spec §12 certification gate. Returns whether the learner currently
 * qualifies for a certificate on this course. Pure read — does not mutate.
 */
export async function checkCertEligibility(
  userId: string,
  courseId: string
): Promise<CertEligibility> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      academyId: true,
      isFree: true,
      sections: {
        select: { lectures: { select: { id: true, type: true } } },
      },
      // Spec §17 — surveys are soft-disabled, never deleted. Disabled
      // surveys are treated as "no survey" by the gate below so prior
      // responses still count and a disabled survey doesn't indefinitely
      // block certification.
      survey: { select: { id: true, isActive: true } },
    },
  })

  const defaultRule = {
    minContentPct: 50,
    minAssessmentPct: 80,
    requiresSurvey: true,
    mustBeBeforeExpiry: true,
  }

  const rule =
    (course?.academyId
      ? await prisma.certificateRule.findFirst({
          where: { academyId: course.academyId, isActive: true },
        })
      : null) ?? null

  const effective = rule
    ? {
        minContentPct: rule.minContentPct,
        minAssessmentPct: rule.minAssessmentPct,
        requiresSurvey: rule.requiresSurvey,
        mustBeBeforeExpiry: rule.mustBeBeforeExpiry,
      }
    : defaultRule

  if (!course) {
    return {
      eligible: false,
      reason: "CONTENT_INCOMPLETE",
      contentPct: 0,
      assessmentPct: null,
      surveyDone: false,
      rule: effective,
    }
  }

  const allLectures = course.sections.flatMap((s) => s.lectures)
  const totalLectures = allLectures.length
  const quizLectures = allLectures.filter((l) => l.type === "QUIZ")

  const completedContent = totalLectures
    ? await prisma.lectureProgress.count({
        where: {
          userId,
          isCompleted: true,
          lectureId: { in: allLectures.map((l) => l.id) },
        },
      })
    : 0
  const contentPct = totalLectures
    ? Math.round((completedContent / totalLectures) * 100)
    : 0

  // Assessment: average of best passing attempt per quiz lecture.
  let assessmentPct: number | null = null
  if (quizLectures.length > 0) {
    const scores: number[] = []
    for (const q of quizLectures) {
      const best = await prisma.assessmentAttempt.findFirst({
        where: { userId, lectureId: q.id, passed: true },
        orderBy: { scorePct: "desc" },
        select: { scorePct: true },
      })
      scores.push(best ? Number(best.scorePct) : 0)
    }
    assessmentPct = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  // Survey done? An inactive (soft-disabled) survey is treated as if no
  // survey exists, so the gate falls through to "satisfied" rather than
  // blocking forever on a removed survey.
  const activeSurvey = course.survey?.isActive ? course.survey : null
  let surveyDone = !effective.requiresSurvey
  if (activeSurvey && effective.requiresSurvey) {
    const response = await prisma.surveyResponse.findFirst({
      where: { surveyId: activeSurvey.id, userId },
      select: { id: true },
    })
    surveyDone = !!response
  } else if (!activeSurvey && effective.requiresSurvey) {
    // No active survey on the course — treat the requirement as satisfied
    // so cert isn't blocked by a content-editor omission or a soft-disable.
    surveyDone = true
  }

  // Spec §6 — certificates issue ONLY for paid content. The grant's
  // productType is the source of truth: a learner with a PROGRAMME grant
  // paid for the bundle, so per-course certs MUST issue inside a paid
  // programme even when the individual course is `isFree`. A direct
  // COURSE grant on an `isFree` course did not pay, so cert is blocked.
  // COMPLIMENTARY grants never qualify.
  const access = await checkCourseAccess(userId, courseId)

  if (effective.mustBeBeforeExpiry && !access.allowed) {
    return {
      eligible: false,
      reason: access.reason === "EXPIRED" ? "EXPIRED" : "NO_ACCESS",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  // Without an active grant we cannot determine paid-vs-complimentary.
  if (!access.allowed) {
    return {
      eligible: false,
      reason: "NO_ACCESS",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  if (access.grant.productType === "COMPLIMENTARY") {
    return {
      eligible: false,
      reason: "NOT_PAID",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  // Direct course grant on a free course — never paid for, no cert.
  // (Programme grants pass through; per spec §6.3 each course inside a
  // paid programme issues its own cert.)
  if (access.grant.productType === "COURSE" && course.isFree) {
    return {
      eligible: false,
      reason: "NOT_PAID",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  if (contentPct < effective.minContentPct) {
    return {
      eligible: false,
      reason: "CONTENT_INCOMPLETE",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  if (
    quizLectures.length > 0 &&
    (assessmentPct ?? 0) < effective.minAssessmentPct
  ) {
    return {
      eligible: false,
      reason: "ASSESSMENT_FAIL",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  if (effective.requiresSurvey && !surveyDone) {
    return {
      eligible: false,
      reason: "SURVEY_MISSING",
      contentPct,
      assessmentPct,
      surveyDone,
      rule: effective,
    }
  }

  return {
    eligible: true,
    contentPct,
    assessmentPct,
    surveyDone,
    rule: effective,
  }
}

/**
 * Issue (or return the existing) certificate if the learner is eligible.
 * Idempotent — running twice won't create duplicates.
 */
export async function maybeIssueCertificate(userId: string, courseId: string) {
  const existing = await prisma.certificate.findFirst({
    where: { userId, courseId, revokedAt: null },
    select: { id: true, certificateId: true },
  })
  if (existing) return { issued: false, certificate: existing, reason: "ALREADY_ISSUED" as const }

  const elig = await checkCertEligibility(userId, courseId)
  if (!elig.eligible) return { issued: false, certificate: null, reason: elig.reason, eligibility: elig }

  const [course, user] = await Promise.all([
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        academyId: true,
        title: true,
        instructor: { select: { name: true } },
        cpdCatalog: { select: { name: true, points: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { nameToBeCalled: true, certificateName: true, certificateIdNumber: true, name: true },
    }),
  ])

  if (!course || !user) return { issued: false, certificate: null, reason: "CONTENT_INCOMPLETE" as const }

  const template = course.academyId
    ? await prisma.certificateTemplate.findFirst({
        where: { academyId: course.academyId, isDefault: true },
      })
    : null

  const cert = await prisma.certificate.create({
    data: {
      certificateId: `CERT-${nanoid(10).toUpperCase()}`,
      userId,
      courseId,
      courseName: course.title,
      instructorName: course.instructor.name || "Instructor",
      nameToBeCalled: user.nameToBeCalled,
      certificateName: user.certificateName ?? user.name,
      certificateIdNumber: user.certificateIdNumber,
      cpdName: course.cpdCatalog?.name,
      cpdPoints: course.cpdCatalog?.points,
      contentCompletionPct: elig.contentPct,
      assessmentScorePct: elig.assessmentPct,
      templateId: template?.id,
      templateSnapshot: template
        ? {
            name: template.name,
            primaryLogoUrl: template.primaryLogoUrl,
            secondaryLogoUrl: template.secondaryLogoUrl,
            signatoryName: template.signatoryName,
            signatoryTitle: template.signatoryTitle,
            layoutJson: template.layoutJson,
          }
        : undefined,
    },
  })

  await audit({
    action: "certificate.issued",
    resourceType: "certificate",
    resourceId: cert.id,
    userId,
    academyId: course.academyId,
    metadata: {
      courseId,
      certificateId: cert.certificateId,
      contentPct: elig.contentPct,
      assessmentPct: elig.assessmentPct,
    },
  })

  return { issued: true, certificate: cert, reason: null }
}
