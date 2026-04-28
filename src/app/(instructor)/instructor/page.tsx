import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InstructorCourseList } from "@/components/courses/instructor-course-list"

export const metadata: Metadata = {
  title: "Course Developer Courses",
  description: "Manage your courses",
}

async function getSampleCourses() {
  try {
    const courses = await prisma.course.findMany({
      where: { status: "PUBLISHED", isFeatured: true },
      select: {
        id: true,
        title: true,
        status: true,
        price: true,
        thumbnail: true,
        averageRating: true,
        updatedAt: true,
        totalStudents: true,
      },
      orderBy: { featuredOrder: "asc" },
      take: 6,
    })

    return courses.map((course) => {
      const price = Number(course.price)
      const monthly = Math.max(1, Math.floor(course.totalStudents / 12))
      return {
        id: course.id,
        title: course.title,
        status: course.status,
        price,
        thumbnail: course.thumbnail,
        averageRating: Number(course.averageRating),
        totalEarnings: Math.round(price * course.totalStudents * 100 * 0.5),
        monthlyEarnings: Math.round(price * monthly * 100 * 0.5),
        totalStudents: course.totalStudents,
        monthlyEnrollments: monthly,
        updatedAt: course.updatedAt.toISOString(),
      }
    })
  } catch (error) {
    console.error("Failed to fetch sample courses:", error)
    return []
  }
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

    // Fetch total earnings per course (instructorEarning is in cents)
    const totalEarnings = await prisma.purchase.groupBy({
      by: ["courseId"],
      where: {
        courseId: { in: courseIds },
        status: "COMPLETED",
      },
      _sum: { instructorEarning: true },
    })

    // Fetch this month's earnings per course
    const monthlyEarnings = await prisma.purchase.groupBy({
      by: ["courseId"],
      where: {
        courseId: { in: courseIds },
        status: "COMPLETED",
        createdAt: { gte: monthStart },
      },
      _sum: { instructorEarning: true },
    })

    // Fetch this month's enrollments per course
    const monthlyEnrollments = await prisma.enrollment.groupBy({
      by: ["courseId"],
      where: {
        courseId: { in: courseIds },
        createdAt: { gte: monthStart },
      },
      _count: true,
    })

    // Build lookup maps
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

  if (!session?.user) {
    return null
  }

  const ownCourses = await getInstructorCourses(session.user.id)
  const courses = ownCourses.length > 0 ? ownCourses : await getSampleCourses()
  const isSample = ownCourses.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Courses</h1>
        {isSample && (
          <p className="text-sm text-muted-foreground">
            Showing sample courses from the catalogue. Create your own course to replace this view.
          </p>
        )}
      </div>

      <InstructorCourseList courses={courses} />
    </div>
  )
}
