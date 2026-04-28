import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Play,
  FileText,
  HelpCircle,
  CheckCircle,
  Circle,
  ChevronRight,
  Clock,
  Lock,
  AlertTriangle,
  Award,
} from "lucide-react"

interface CoursePageProps {
  params: Promise<{ courseId: string }>
}

async function getEnrollment(courseId: string, userId: string) {
  try {
    return await prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
      include: {
        course: {
          include: {
            instructor: { select: { name: true } },
            sections: {
              orderBy: { position: "asc" },
              include: {
                lectures: { orderBy: { position: "asc" } },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    console.error("Failed to fetch enrollment:", error)
    return null
  }
}

async function getLectureProgress(userId: string, courseId: string) {
  try {
    const progress = await prisma.lectureProgress.findMany({
      where: { userId, lecture: { section: { courseId } } },
      select: { lectureId: true, isCompleted: true, lastPosition: true },
    })
    return progress.reduce(
      (acc, p) => {
        acc[p.lectureId] = { isCompleted: p.isCompleted, lastPosition: p.lastPosition }
        return acc
      },
      {} as Record<string, { isCompleted: boolean; lastPosition: number }>
    )
  } catch {
    return {}
  }
}

async function getAssessmentScores(userId: string, courseId: string) {
  try {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        userId,
        lecture: { section: { courseId } },
      },
      select: {
        lectureId: true,
        scorePct: true,
        passed: true,
        attemptNumber: true,
      },
      orderBy: { attemptNumber: "desc" },
    })
    // Keep only the latest attempt per lecture
    const latest = new Map<string, { scorePct: number; passed: boolean; attempts: number }>()
    for (const a of attempts) {
      if (!latest.has(a.lectureId)) {
        latest.set(a.lectureId, {
          scorePct: Number(a.scorePct),
          passed: a.passed,
          attempts: a.attemptNumber,
        })
      }
    }
    return latest
  } catch {
    return new Map<string, { scorePct: number; passed: boolean; attempts: number }>()
  }
}

function daysUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 86_400_000)
}

export async function generateMetadata({ params }: CoursePageProps): Promise<Metadata> {
  const { courseId } = await params
  const session = await auth()
  if (!session?.user) return { title: "E-Courses" }
  const enrollment = await getEnrollment(courseId, session.user.id)
  return { title: enrollment?.course.title || "Course Not Found" }
}

export default async function CourseLearningPage({ params }: CoursePageProps) {
  const { courseId } = await params
  const session = await auth()

  if (!session?.user) {
    redirect("/login?callbackUrl=/my-courses")
  }

  const enrollment = await getEnrollment(courseId, session.user.id)
  if (!enrollment) notFound()

  // Check access grant (auto-lock after expiry)
  const accessCheck = await checkCourseAccess(session.user.id, courseId)
  const isExpired = !accessCheck.allowed && accessCheck.reason === "EXPIRED"
  const grant = accessCheck.allowed ? accessCheck.grant : null
  const isComplimentary = grant?.productType === "COMPLIMENTARY"
  const daysLeft = grant && !isComplimentary ? daysUntil(grant.expiresAt) : null

  const [lectureProgress, assessmentScores] = await Promise.all([
    getLectureProgress(session.user.id, courseId),
    getAssessmentScores(session.user.id, courseId),
  ])

  const { course } = enrollment
  const totalLectures = course.sections.reduce(
    (acc, s) => acc + s.lectures.length, 0
  )
  const completedLectures = Object.values(lectureProgress).filter((p) => p.isCompleted).length

  // Find next incomplete lecture
  let nextLecture: { id: string; title: string } | null = null
  for (const section of course.sections) {
    for (const lecture of section.lectures) {
      if (!lectureProgress[lecture.id]?.isCompleted) {
        nextLecture = { id: lecture.id, title: lecture.title }
        break
      }
    }
    if (nextLecture) break
  }

  const totalDuration = course.sections.reduce(
    (acc, s) => acc + s.lectures.reduce((la, l) => la + (l.videoDuration || 0), 0), 0
  )
  const hours = Math.floor(totalDuration / 3600)
  const minutes = Math.floor((totalDuration % 3600) / 60)

  // Assessment summary
  const quizLectures = course.sections.flatMap((s) =>
    s.lectures.filter((l) => l.type === "QUIZ")
  )
  const quizzesTaken = quizLectures.filter((l) => assessmentScores.has(l.id)).length
  const quizzesPassed = quizLectures.filter((l) => assessmentScores.get(l.id)?.passed).length
  const avgScore = quizzesTaken > 0
    ? Math.round(
        quizLectures.reduce((sum, l) => sum + (assessmentScores.get(l.id)?.scorePct || 0), 0) /
        quizzesTaken
      )
    : null

  return (
    <div className="container max-w-5xl py-6 px-4 sm:py-8 space-y-6">
      {/* Expiry warning banner */}
      {isExpired && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-destructive">Access expired</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your access window for this course has ended. You can still view your certificates.
            </p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link href="/certificates">View Certificates</Link>
            </Button>
          </div>
        </div>
      )}

      {!isExpired && daysLeft !== null && daysLeft <= 14 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 flex items-start gap-3 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Complete your course before access expires.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold mb-2">{course.title}</h1>
        <p className="text-muted-foreground">by {course.instructor.name}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left sidebar - Progress + Assessments */}
        <div className="lg:col-span-1 space-y-4">
          {/* Progress Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary mb-1">
                  {enrollment.progress}%
                </div>
                <p className="text-xs text-muted-foreground">
                  {completedLectures} of {totalLectures} lectures
                </p>
              </div>
              <Progress value={enrollment.progress} className="h-3" />

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`} total</span>
              </div>

              {daysLeft !== null && !isExpired && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{daysLeft}d access remaining</span>
                </div>
              )}

              {!isExpired && nextLecture && (
                <Button className="w-full" size="sm" asChild>
                  <Link href={`/my-courses/${courseId}/lectures/${nextLecture.id}`}>
                    <Play className="h-4 w-4 mr-2" />
                    {completedLectures > 0 ? "Resume" : "Start"}
                  </Link>
                </Button>
              )}

              {!isExpired && nextLecture && (
                <p className="text-xs text-muted-foreground text-center truncate">
                  Next: {nextLecture.title}
                </p>
              )}

              {enrollment.progress >= 50 && !isExpired && (
                <Button variant="outline" className="w-full" size="sm" asChild>
                  <Link href={`/my-courses/${courseId}/survey`}>
                    Feedback & Certificate
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Assessment Scores Card */}
          {quizLectures.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Award className="h-4 w-4" />
                  Assessments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {avgScore !== null && (
                  <div className="text-center pb-3 border-b">
                    <div className="text-2xl font-bold">{avgScore}%</div>
                    <p className="text-xs text-muted-foreground">
                      Average score &middot; {quizzesPassed}/{quizLectures.length} passed
                    </p>
                  </div>
                )}
                <div className="space-y-2">
                  {quizLectures.map((quiz) => {
                    const score = assessmentScores.get(quiz.id)
                    return (
                      <div key={quiz.id} className="flex items-center justify-between text-sm">
                        <span className="truncate flex-1 mr-2">{quiz.title}</span>
                        {score ? (
                          <Badge
                            variant={score.passed ? "default" : "destructive"}
                            className="text-xs flex-shrink-0"
                          >
                            {score.scorePct}%
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            Not taken
                          </Badge>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Course Content */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Course Content</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y">
                {course.sections.map((section, sectionIndex) => {
                  const sectionLectures = section.lectures.length
                  const sectionCompleted = section.lectures.filter(
                    (l) => lectureProgress[l.id]?.isCompleted
                  ).length

                  return (
                    <div key={section.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-sm sm:text-base">
                          Section {sectionIndex + 1}: {section.title}
                        </h3>
                        <span className="text-xs text-muted-foreground flex-shrink-0 ml-2">
                          {sectionCompleted}/{sectionLectures}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {section.lectures.map((lecture) => {
                          const progress = lectureProgress[lecture.id]
                          const isCompleted = progress?.isCompleted
                          const score = assessmentScores.get(lecture.id)
                          const isLocked = isExpired

                          return (
                            <Link
                              key={lecture.id}
                              href={isLocked ? "#" : `/my-courses/${courseId}/lectures/${lecture.id}`}
                              className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-colors ${
                                isLocked
                                  ? "opacity-50 cursor-not-allowed"
                                  : "hover:bg-muted"
                              }`}
                            >
                              {isLocked ? (
                                <Lock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              ) : isCompleted ? (
                                <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {lecture.type === "VIDEO" ? (
                                    <Play className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  ) : lecture.type === "QUIZ" ? (
                                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <span className="text-sm truncate">{lecture.title}</span>
                                </div>
                              </div>
                              {/* Quiz score badge */}
                              {score && (
                                <Badge
                                  variant={score.passed ? "default" : "destructive"}
                                  className="text-xs flex-shrink-0"
                                >
                                  {score.scorePct}%
                                </Badge>
                              )}
                              {lecture.videoDuration && !score && (
                                <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:inline">
                                  {Math.floor(lecture.videoDuration / 60)}:
                                  {(lecture.videoDuration % 60).toString().padStart(2, "0")}
                                </span>
                              )}
                              {!isLocked && (
                                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 hidden sm:block" />
                              )}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
