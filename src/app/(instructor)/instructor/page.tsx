import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InstructorCourseList } from "@/components/courses/instructor-course-list"
import { SampleCoursesCTA } from "./sample-courses-cta"

export const metadata: Metadata = {
  title: "Course Developer Courses",
  description: "Manage your courses",
}

async function getInstructorCourses(userId: string) {
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const courses = await prisma.course.findMany({
      where: { instructorId: userId },
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        thumbnail: true,
        averageRating: true,
        updatedAt: true,
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    })

    if (courses.length === 0) return []

    const courseIds = courses.map((c) => c.id)

    // Real earnings per course (instructorEarning is in cents).
    const totalEarnings = await prisma.purchase.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, status: "COMPLETED" },
      _sum: { instructorEarning: true },
    })

    const monthlyEarnings = await prisma.purchase.groupBy({
      by: ["courseId"],
      where: {
        courseId: { in: courseIds },
        status: "COMPLETED",
        createdAt: { gte: monthStart },
      },
      _sum: { instructorEarning: true },
    })

    const monthlyEnrollments = await prisma.enrollment.groupBy({
      by: ["courseId"],
      where: { courseId: { in: courseIds }, createdAt: { gte: monthStart } },
      _count: true,
    })

    const totalEarningsMap = new Map(
      totalEarnings.map((e) => [e.courseId, e._sum.instructorEarning || 0])
    )
    const monthlyEarningsMap = new Map(
      monthlyEarnings.map((e) => [e.courseId, e._sum.instructorEarning || 0])
    )
    const monthlyEnrollmentsMap = new Map(
      monthlyEnrollments.map((e) => [e.courseId, e._count])
    )

    return courses.map((course) => ({
      id: course.id,
      title: course.title,
      status: course.status,
      price: Number(course.price),
      thumbnail: course.thumbnail,
      averageRating: Number(course.averageRating),
      totalEarnings: totalEarningsMap.get(course.id) || 0,
      monthlyEarnings: monthlyEarningsMap.get(course.id) || 0,
      totalStudents: course._count.enrollments,
      monthlyEnrollments: monthlyEnrollmentsMap.get(course.id) || 0,
      updatedAt: course.updatedAt.toISOString(),
    }))
  } catch (error) {
    console.error("Failed to fetch instructor courses:", error)
    return []
  }
}

export default async function InstructorCoursesPage() {
  const session = await auth()
  if (!session?.user) return null

  const courses = await getInstructorCourses(session.user.id)
  const isEmpty = courses.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Courses</h1>
        {isEmpty && (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t created any courses yet. Generate sample courses
            below or create your first course from scratch.
          </p>
        )}
      </div>

      {isEmpty && <SampleCoursesCTA />}

      <InstructorCourseList courses={courses} />
    </div>
  )
}
