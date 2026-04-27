import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reviewSchema } from "@/lib/validations/course"
import { recalculateCourseRating } from "@/lib/reviews"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const { id: courseId, reviewId } = await params

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    })

    if (!review) {
      return NextResponse.json(
        { error: "Review not found", code: "REVIEW_NOT_FOUND" },
        { status: 404 }
      )
    }

    if (review.userId !== session.user.id) {
      return NextResponse.json(
        { error: "You can only edit your own review", code: "NOT_REVIEW_OWNER" },
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

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    await recalculateCourseRating(courseId)

    return NextResponse.json({ review: updated })
  } catch (error) {
    console.error("Error updating review:", error)
    return NextResponse.json(
      { error: "Failed to update review", code: "UPDATE_FAILED" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; reviewId: string }> }
) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const { id: courseId, reviewId } = await params

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    })

    if (!review) {
      return NextResponse.json(
        { error: "Review not found", code: "REVIEW_NOT_FOUND" },
        { status: 404 }
      )
    }

    if (review.userId !== session.user.id) {
      return NextResponse.json(
        {
          error: "You can only delete your own review",
          code: "NOT_REVIEW_OWNER",
        },
        { status: 403 }
      )
    }

    await prisma.review.delete({
      where: { id: reviewId },
    })

    await recalculateCourseRating(courseId)

    return NextResponse.json({ message: "Review deleted successfully" })
  } catch (error) {
    console.error("Error deleting review:", error)
    return NextResponse.json(
      { error: "Failed to delete review", code: "DELETE_FAILED" },
      { status: 500 }
    )
  }
}
