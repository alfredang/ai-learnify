import { prisma } from "@/lib/prisma"

export async function getCartItemCourseIds(userId?: string): Promise<Set<string>> {
  if (!userId) return new Set()

  const items = await prisma.cartItem.findMany({
    where: { userId },
    select: { courseId: true },
  })

  return new Set(items.map((item) => item.courseId))
}

export async function getCartCount(userId?: string): Promise<number> {
  if (!userId) return 0

  return prisma.cartItem.count({
    where: { userId },
  })
}
