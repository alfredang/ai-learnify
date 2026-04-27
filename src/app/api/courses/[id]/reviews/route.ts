import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reviewSchema } from "@/lib/validations/course"
import { recalculateCourseRating } from "@/lib/reviews"
import { ITEMS_PER_PAGE } from "@/lib/constants"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const sort = searchParams.get("sort") || "newest"

    const orderBy =
      sort === "highest"
        ? { rating: "desc" as const }
        : sort === "lowest"
          ? { rating: "asc" as const }
          : { createdAt: "desc" as const }

    const [reviews, total, distribution] = await Promise.all([
      prisma.review.findMany({
        where: { courseId, isApproved: true },
        take: ITEMS_PER_PAGE,
        skip: (page - 1) * ITEMS_PER_PAGE,
        orderBy,
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      }),
      prisma.review.count({
        where: { courseId, isApproved: true },
      }),
      prisma.review.groupBy({
        by: ["rating"],
        where: { courseId, isApproved: true },
        _count: true,
      }),
    ])

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    }
    for (const item of distribution) {
      ratingDistribution[item.rating] = item._count
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { averageRating: true, totalReviews: true },
    })

    return NextResponse.json({
      reviews,
      meta: {
        total,
        page,
        pageSize: ITEMS_PER_PAGE,
        totalPages: Math.ceil(total / ITEMS_PER_PAGE),
      },
      ratingDistribution,
      averageRating: course ? Number(course.averageRating) : 0,
      totalReviews: course?.totalReviews ?? 0,
    })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    return NextResponse.json(
      { error: "Failed to fetch reviews", code: "FETCH_FAILED" },
      { status: 500 }
    )
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const { id: courseId } = await params

    const course = await prisma.course.findUnique({
      where: { id: courseId, status: "PUBLISHED" },
      select: { id: true, instructorId: true },
    })

    if (!course) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        { status: 404 }
      )
    }

    if (course.instructorId === session.user.id) {
      return NextResponse.json(
        { error: "You cannot review your own course", code: "SELF_REVIEW" },
        { status: 403 }
      )
    }

    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (!enrollment) {
      return NextResponse.json(
        {
          error: "You must be enrolled in this course to review it",
          code: "NOT_ENROLLED",
        },
        { status: 403 }
      )
    }

    const body = await request.json()
    const parsed = reviewSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          issues: parsed.error.issues,
        },
        { status: 400 }
      )
    }

    const existing = await prisma.review.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (existing) {
      return NextResponse.json(
        {
          error: "You have already reviewed this course",
          code: "ALREADY_REVIEWED",
        },
        { status: 400 }
      )
    }

    const review = await prisma.review.create({
      data: {
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
        userId: session.user.id,
        courseId,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    await recalculateCourseRating(courseId)

    return NextResponse.json({ review }, { status: 201 })
  } catch (error) {
    console.error("Error creating review:", error)
    return NextResponse.json(
      { error: "Failed to create review", code: "CREATE_FAILED" },
      { status: 500 }
    )
  }
}
