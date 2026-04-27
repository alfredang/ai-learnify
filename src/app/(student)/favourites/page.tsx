import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getCartItemCourseIds } from "@/lib/cart"
import { FavouritesGrid } from "./favourites-grid"

export const metadata: Metadata = {
  title: "My Favourite Courses",
  description: "Courses you've saved for later",
}

async function getFavourites(userId: string) {
  try {
    const items = await prisma.wishlist.findMany({
      where: { userId },
      include: {
        course: {
          include: {
            instructor: {
              select: { id: true, name: true, image: true, headline: true },
            },
            category: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return JSON.parse(JSON.stringify(items))
  } catch (error) {
    console.error("Failed to fetch favourites:", error)
    return []
  }
}

async function getEnrolledCourseIds(userId: string) {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      select: { courseId: true },
    })

    return enrollments.map((e) => e.courseId)
  } catch {
    return []
  }
}

export default async function FavouritesPage() {
  const session = await auth()

  if (!session?.user) {
    redirect("/login?callbackUrl=/favourites")
  }

  const [favourites, enrolledCourseIds, cartCourseIds] = await Promise.all([
    getFavourites(session.user.id),
    getEnrolledCourseIds(session.user.id),
    getCartItemCourseIds(session.user.id),
  ])

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-8">My Favourite Courses</h1>
      <FavouritesGrid initialItems={favourites} enrolledCourseIds={enrolledCourseIds} cartCourseIds={Array.from(cartCourseIds)} />
    </div>
  )
}
