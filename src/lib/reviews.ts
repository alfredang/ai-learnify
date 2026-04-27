import { prisma } from "@/lib/prisma"

export async function recalculateCourseRating(courseId: string) {
  const result = await prisma.review.aggregate({
    where: { courseId, isApproved: true },
    _avg: { rating: true },
    _count: { rating: true },
  })

  const averageRating = result._avg.rating
    ? Math.round(result._avg.rating * 10) / 10
    : 0
  const totalReviews = result._count.rating

  await prisma.course.update({
    where: { id: courseId },
    data: {
      averageRating,
      totalReviews,
    },
  })
}
