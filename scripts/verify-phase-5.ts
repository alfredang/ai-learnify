/**
 * Phase 5 end-to-end verification.
 *
 * - Picks an existing seeded student + any published course they have an
 *   AccessGrant for.
 * - Fakes 100% lecture progress + a passing assessment attempt + a survey
 *   response, then calls maybeIssueCertificate().
 * - Verifies the certificate row, prints the public /verify URL.
 */

import { PrismaClient } from "@prisma/client"
import { maybeIssueCertificate, checkCertEligibility } from "../src/lib/certification"

const prisma = new PrismaClient()

async function main() {
  const learner = await prisma.user.findFirst({
    where: { accessGrants: { some: { productType: "COURSE", isActive: true } } },
    select: {
      id: true,
      email: true,
      nameToBeCalled: true,
      accessGrants: {
        where: { productType: "COURSE", isActive: true },
        select: { courseId: true },
        take: 1,
      },
    },
  })
  if (!learner || !learner.accessGrants[0]?.courseId) {
    throw new Error("No learner with course access grant found")
  }

  const courseId = learner.accessGrants[0].courseId
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      title: true,
      sections: {
        select: { lectures: { select: { id: true, type: true } } },
      },
    },
  })
  if (!course) throw new Error("Course not found")

  const lectures = course.sections.flatMap((s) => s.lectures)
  const quiz = lectures.find((l) => l.type === "QUIZ")

  console.log(`\nLearner: ${learner.email} (${learner.nameToBeCalled ?? "—"})`)
  console.log(`Course:  ${course.title}`)
  console.log(`Lectures: ${lectures.length} total, quiz lectures: ${lectures.filter((l) => l.type === "QUIZ").length}`)

  // Fake 100% content completion
  for (const l of lectures) {
    await prisma.lectureProgress.upsert({
      where: { userId_lectureId: { userId: learner.id, lectureId: l.id } },
      create: {
        userId: learner.id,
        lectureId: l.id,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: { isCompleted: true, completedAt: new Date() },
    })
  }
  console.log(`✓ Marked all ${lectures.length} lectures complete`)

  // Fake a passing assessment if there's a quiz
  if (quiz) {
    await prisma.assessmentAttempt.create({
      data: {
        lectureId: quiz.id,
        userId: learner.id,
        attemptNumber: 999,
        scorePct: 95,
        pointsEarned: 95,
        maxPoints: 100,
        passed: true,
        answersJson: { synthetic: true },
      },
    })
    console.log("✓ Recorded passing assessment attempt (95%)")
  } else {
    console.log("(No quiz on this course — assessment check skipped)")
  }

  // Fake survey response
  let survey = await prisma.survey.findUnique({ where: { courseId } })
  if (!survey) {
    survey = await prisma.survey.create({
      data: {
        courseId,
        title: "Course feedback",
        description: "Auto-created by Phase 5 verification",
        questionsJson: { version: 1, questions: [] },
        isMandatoryForCert: true,
      },
    })
    console.log("✓ Created survey for course")
  }
  await prisma.surveyResponse.upsert({
    where: { surveyId_userId: { surveyId: survey.id, userId: learner.id } },
    create: {
      surveyId: survey.id,
      userId: learner.id,
      starRating: 5,
      answersJson: { synthetic: true },
    },
    update: { starRating: 5, submittedAt: new Date() },
  })
  console.log("✓ Recorded 5-star survey response")

  // Check eligibility
  const elig = await checkCertEligibility(learner.id, courseId)
  console.log("\nEligibility:")
  console.dir(elig, { depth: null })

  // Clear any existing cert so we can see issuance happen
  await prisma.certificate.deleteMany({ where: { userId: learner.id, courseId } })

  // Issue
  const result = await maybeIssueCertificate(learner.id, courseId)
  console.log("\nIssue result:")
  console.dir(result, { depth: null })

  if (result.issued && result.certificate) {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    console.log(`\nVerify URL: ${base}/verify/${result.certificate.certificateId}`)
    console.log(`Download:   ${base}/api/certificates/${result.certificate.id}/download`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
