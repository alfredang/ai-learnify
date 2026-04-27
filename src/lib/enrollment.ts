import { prisma } from "@/lib/prisma"

export async function getEnrolledCourseMap(userId?: string): Promise<Map<string, number>> {
  if (!userId) return new Map()

  const items = await prisma.enrollment.findMany({
    where: { userId },
    select: { courseId: true, progress: true },
  })

  return new Map(items.map((item) => [item.courseId, item.progress]))
}
