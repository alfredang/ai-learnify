import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { BookOpen, Play, Lock, Clock, AlertTriangle } from "lucide-react"

export const metadata: Metadata = {
  title: "E-Courses",
  description: "Your enrolled e-courses",
}

function daysUntil(date: Date): number {
  return Math.round((date.getTime() - Date.now()) / 86_400_000)
}

async function getEnrollmentsWithAccess(userId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId },
    include: {
      course: {
        include: {
          instructor: { select: { name: true, image: true } },
          sections: {
            orderBy: { position: "asc" },
            include: {
              lectures: {
                orderBy: { position: "asc" },
                select: { id: true, title: true, type: true },
              },
            },
          },
        },
      },
    },
    orderBy: { lastAccessedAt: "desc" },
  })

  // Fetch access grants and lecture progress for all enrolled courses
  const courseIds = enrollments.map((e) => e.courseId)
  const [grants, progressRecords] = await Promise.all([
    prisma.accessGrant.findMany({
      where: { userId, courseId: { in: courseIds }, isActive: true },
    }),
    prisma.lectureProgress.findMany({
      where: {
        userId,
        lecture: { section: { courseId: { in: courseIds } } },
      },
      select: { lectureId: true, isCompleted: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  const grantMap = new Map(grants.map((g) => [g.courseId!, g]))
  const progressMap = new Map<string, { lectureId: string; isCompleted: boolean; updatedAt: Date }[]>()

  // Group progress by course (via lecture -> section -> course)
  const allLectureIds = new Set(progressRecords.map((p) => p.lectureId))
  const lectureToCourseLookup = new Map<string, string>()
  for (const e of enrollments) {
    for (const s of e.course.sections) {
      for (const l of s.lectures) {
        if (allLectureIds.has(l.id)) {
          lectureToCourseLookup.set(l.id, e.courseId)
        }
      }
    }
  }
  for (const p of progressRecords) {
    const cId = lectureToCourseLookup.get(p.lectureId)
    if (cId) {
      if (!progressMap.has(cId)) progressMap.set(cId, [])
      progressMap.get(cId)!.push(p)
    }
  }

  return enrollments.map((enrollment) => {
    const grant = grantMap.get(enrollment.courseId)
    const progress = progressMap.get(enrollment.courseId) || []
    const now = new Date()

    // Access status
    const isComplimentary = grant?.productType === "COMPLIMENTARY"
    const isExpired = grant ? !isComplimentary && grant.expiresAt <= now : false
    const daysLeft = grant && !isComplimentary ? daysUntil(grant.expiresAt) : null

    // Find next incomplete lecture
    let nextLecture: { id: string; title: string } | null = null
    const completedIds = new Set(progress.filter((p) => p.isCompleted).map((p) => p.lectureId))
    for (const section of enrollment.course.sections) {
      for (const lecture of section.lectures) {
        if (!completedIds.has(lecture.id)) {
          nextLecture = { id: lecture.id, title: lecture.title }
          break
        }
      }
      if (nextLecture) break
    }

    const totalLectures = enrollment.course.sections.reduce(
      (acc, s) => acc + s.lectures.length, 0
    )

    return {
      ...enrollment,
      grant,
      isExpired,
      isComplimentary,
      daysLeft,
      nextLecture,
      totalLectures,
      completedLectures: completedIds.size,
    }
  })
}

export default async function MyCoursesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login?callbackUrl=/my-courses")
  }

  const enrollments = await getEnrollmentsWithAccess(session.user.id)

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <BookOpen className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">E-Courses</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your enrolled e-courses. Pick up where you left off.
          </p>
        </div>
      </div>

      {enrollments.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {enrollments.map((enrollment) => (
            <Card
              key={enrollment.id}
              className={`overflow-hidden ${enrollment.isExpired ? "opacity-75" : ""}`}
            >
              <Link href={enrollment.isExpired ? "#" : `/my-courses/${enrollment.course.id}`}>
                <div className="relative aspect-video">
                  <Image
                    src={enrollment.course.thumbnail || "/images/placeholder-course.jpg"}
                    alt={enrollment.course.title}
                    fill
                    className="object-cover"
                  />
                  {enrollment.isExpired && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Lock className="h-8 w-8 mx-auto mb-2" />
                        <p className="text-sm font-medium">Access Expired</p>
                      </div>
                    </div>
                  )}
                  {!enrollment.isExpired && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center">
                        <Play className="h-6 w-6 text-slate-900 ml-0.5" />
                      </div>
                    </div>
                  )}
                </div>
              </Link>
              <CardContent className="p-4 space-y-3">
                <Link href={enrollment.isExpired ? "#" : `/my-courses/${enrollment.course.id}`}>
                  <h3 className="font-semibold line-clamp-2 hover:text-primary">
                    {enrollment.course.title}
                  </h3>
                </Link>
                <p className="text-sm text-muted-foreground">
                  {enrollment.course.instructor.name}
                </p>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{enrollment.progress}% complete</span>
                    <span>
                      {enrollment.completedLectures}/{enrollment.totalLectures} lectures
                    </span>
                  </div>
                  <Progress value={enrollment.progress} className="h-2" />
                </div>

                {/* Access expiry info */}
                {enrollment.isExpired ? (
                  <Badge variant="destructive" className="text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Access expired
                  </Badge>
                ) : enrollment.daysLeft !== null && enrollment.daysLeft <= 14 ? (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 bg-amber-50">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {enrollment.daysLeft}d left
                  </Badge>
                ) : enrollment.daysLeft !== null ? (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{enrollment.daysLeft}d access remaining</span>
                  </div>
                ) : null}

                {/* Resume / action button */}
                {enrollment.isExpired ? (
                  <Button variant="outline" className="w-full" size="sm" asChild>
                    <Link href="/certificates">View Certificates</Link>
                  </Button>
                ) : enrollment.nextLecture ? (
                  <Button className="w-full" size="sm" asChild>
                    <Link href={`/my-courses/${enrollment.course.id}/lectures/${enrollment.nextLecture.id}`}>
                      <Play className="h-3.5 w-3.5 mr-1.5" />
                      {enrollment.progress > 0 ? "Resume" : "Start"}: {enrollment.nextLecture.title}
                    </Link>
                  </Button>
                ) : (
                  <Button variant="secondary" className="w-full" size="sm" asChild>
                    <Link href={`/my-courses/${enrollment.course.id}`}>
                      Course Completed
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Start learning by enrolling in your first course"
          actionLabel="Browse E-Courses"
          actionHref="/courses"
        />
      )}
    </div>
  )
}
