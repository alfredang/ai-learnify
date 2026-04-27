import type { Metadata } from "next"
import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkCourseAccess } from "@/lib/access"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import { LectureViewer } from "./lecture-viewer"

interface LecturePageProps {
  params: Promise<{ courseId: string; lectureId: string }>
}

async function getLectureData(courseId: string, lectureId: string, userId: string) {
  try {
    // Verify enrollment
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
      include: {
        course: {
          include: {
            instructor: {
              select: { id: true, name: true, image: true },
            },
            sections: {
              orderBy: { position: "asc" },
              include: {
                lectures: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        },
      },
    })

    if (!enrollment) return null

    // Get current lecture
    const lecture = enrollment.course.sections
      .flatMap((s) => s.lectures)
      .find((l) => l.id === lectureId)

    if (!lecture) return null

    // Get all lecture progress for this course
    const progressRecords = await prisma.lectureProgress.findMany({
      where: {
        userId,
        lecture: {
          section: { courseId },
        },
      },
      select: {
        lectureId: true,
        isCompleted: true,
        lastPosition: true,
      },
    })

    const lectureProgress = progressRecords.reduce(
      (acc, p) => {
        acc[p.lectureId] = { isCompleted: p.isCompleted, lastPosition: p.lastPosition }
        return acc
      },
      {} as Record<string, { isCompleted: boolean; lastPosition: number }>
    )

    // Build flat lecture list for prev/next navigation
    const allLectures = enrollment.course.sections.flatMap((s) =>
      s.lectures.map((l) => ({ id: l.id, title: l.title }))
    )
    const currentIndex = allLectures.findIndex((l) => l.id === lectureId)
    const prevLecture = currentIndex > 0 ? allLectures[currentIndex - 1] : null
    const nextLecture =
      currentIndex < allLectures.length - 1 ? allLectures[currentIndex + 1] : null

    return {
      enrollment,
      course: enrollment.course,
      lecture,
      lectureProgress,
      prevLecture,
      nextLecture,
    }
  } catch (error) {
    console.error("Failed to fetch lecture data:", error)
    return null
  }
}

export async function generateMetadata({
  params,
}: LecturePageProps): Promise<Metadata> {
  const { courseId, lectureId } = await params
  const session = await auth()

  if (!session?.user) return { title: "Lecture" }

  const data = await getLectureData(courseId, lectureId, session.user.id)

  return {
    title: data ? `${data.lecture.title} - ${data.course.title}` : "Lecture Not Found",
  }
}

export default async function LecturePage({ params }: LecturePageProps) {
  const { courseId, lectureId } = await params
  const session = await auth()

  if (!session?.user) {
    redirect(`/login?callbackUrl=/my-courses/${courseId}/lectures/${lectureId}`)
  }

  const data = await getLectureData(courseId, lectureId, session.user.id)

  if (!data) {
    notFound()
  }

  // Spec §9 — content is locked once the AccessGrant expires. The progress
  // API returns 410 either way, but the page itself must stop revealing
  // lecture URLs/text to a learner whose window has closed.
  const access = await checkCourseAccess(session.user.id, courseId)
  if (!access.allowed) {
    return (
      <div className="container max-w-2xl py-16">
        <div className="rounded-lg border bg-card p-8 text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold">
            {access.reason === "EXPIRED"
              ? "Your access window has ended"
              : "You don't have access to this content"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {access.reason === "EXPIRED"
              ? "Your 90-day access to this course has expired. Your certificate (if issued) remains available on your dashboard."
              : "Please contact the academy administrator if you believe this is in error."}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button asChild variant="outline">
              <Link href={`/my-courses/${courseId}`}>Back to course</Link>
            </Button>
            <Button asChild>
              <Link href="/certificates">My certificates</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <LectureViewer
      courseId={courseId}
      courseTitle={data.course.title}
      courseProgress={data.enrollment.progress}
      lecture={JSON.parse(JSON.stringify(data.lecture))}
      sections={JSON.parse(JSON.stringify(data.course.sections))}
      lectureProgress={data.lectureProgress}
      prevLecture={data.prevLecture}
      nextLecture={data.nextLecture}
    />
  )
}
