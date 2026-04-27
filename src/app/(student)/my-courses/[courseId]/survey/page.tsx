import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { checkCertEligibility } from "@/lib/certification"
import { SurveyForm } from "@/components/courses/survey-form"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react"

interface PageProps {
  params: Promise<{ courseId: string }>
}

/**
 * Spec §7.4 — learner survey submission. This is the mandatory step that
 * (when the academy's CertificateRule requires it) unlocks certification.
 */
export default async function LearnerCourseSurveyPage({ params }: PageProps) {
  const { courseId } = await params
  const session = await auth()
  if (!session?.user) redirect(`/login?callbackUrl=/my-courses/${courseId}/survey`)

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, title: true, slug: true },
  })
  if (!course) notFound()

  const access = await checkCourseAccess(session.user.id, courseId)
  if (!access.allowed) {
    return (
      <div className="container max-w-2xl py-12 text-center space-y-4">
        <h1 className="text-2xl font-bold">Course not accessible</h1>
        <p className="text-muted-foreground">
          {access.reason === "EXPIRED"
            ? "Your access to this course has expired. The survey can only be submitted inside the 90-day access window."
            : "You don't currently have access to this course."}
        </p>
        <Button asChild variant="outline">
          <Link href="/my-courses">Back to my courses</Link>
        </Button>
      </div>
    )
  }

  const [surveyRow, eligibility, existingResponse] = await Promise.all([
    prisma.survey.findUnique({
      where: { courseId },
      select: {
        id: true,
        title: true,
        description: true,
        questionsJson: true,
        isMandatoryForCert: true,
      },
    }),
    checkCertEligibility(session.user.id, courseId),
    prisma.surveyResponse.findFirst({
      where: { survey: { courseId }, userId: session.user.id },
      select: { id: true, starRating: true, submittedAt: true },
    }),
  ])

  // Serialize JSON so the server → client boundary is safe.
  type Question = {
    id: string
    prompt: string
    type: "text" | "rating" | "single_choice" | "multi_choice"
    required?: boolean
    options?: string[]
  }
  const questions: Question[] = Array.isArray(
    (surveyRow?.questionsJson as { questions?: Question[] } | null)?.questions
  )
    ? (surveyRow!.questionsJson as { questions: Question[] }).questions
    : []

  const survey = surveyRow
    ? {
        title: surveyRow.title,
        description: surveyRow.description,
        questions,
      }
    : null

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div>
        <Link
          href={`/my-courses/${courseId}`}
          className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to course
        </Link>
        <h1 className="text-2xl font-bold mt-2">{course.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Course feedback survey
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>
              Content: <b>{eligibility.contentPct}%</b>
            </span>
            <Badge variant="outline" className="text-xs">
              rule ≥ {eligibility.rule.minContentPct}%
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span>
              Assessment:{" "}
              <b>
                {eligibility.assessmentPct !== null
                  ? `${eligibility.assessmentPct}%`
                  : "—"}
              </b>
            </span>
            <Badge variant="outline" className="text-xs">
              rule ≥ {eligibility.rule.minAssessmentPct}%
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {eligibility.surveyDone ? (
              <Badge variant="default">Survey submitted</Badge>
            ) : (
              <Badge variant="secondary">Survey pending</Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {existingResponse ? (
        <Card>
          <CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">You already submitted this survey</h2>
            <p className="text-sm text-muted-foreground">
              Rating: <b>{existingResponse.starRating} / 5</b> · submitted{" "}
              {new Date(existingResponse.submittedAt).toLocaleDateString()}
            </p>
            <Button asChild variant="outline">
              <Link href={`/my-courses/${courseId}`}>Back to course</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <SurveyForm
          courseId={courseId}
          survey={survey}
          redirectTo={`/my-courses/${courseId}`}
        />
      )}
    </div>
  )
}
