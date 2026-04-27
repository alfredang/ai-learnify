"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/shared/star-rating"
import { EmptyState } from "@/components/shared/empty-state"
import { Heart, Trash2, Users } from "lucide-react"
import { formatPrice } from "@/lib/stripe"
import { toast } from "sonner"
import { AddToCartButton } from "@/components/courses/add-to-cart-button"
import type { FavouriteCourse } from "@/types"

interface FavouritesGridProps {
  initialItems: FavouriteCourse[]
  enrolledCourseIds: string[]
  cartCourseIds?: string[]
}

export function FavouritesGrid({ initialItems, enrolledCourseIds, cartCourseIds = [] }: FavouritesGridProps) {
  const [items, setItems] = useState(initialItems)
  const enrolledSet = new Set(enrolledCourseIds)
  const cartSet = new Set(cartCourseIds)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Your favourites list is empty"
        description="Browse courses and save the ones you like for later"
        actionLabel="Browse Courses"
        actionHref="/courses"
      />
    )
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <FavouriteCard
          key={item.id}
          item={item}
          isEnrolled={enrolledSet.has(item.course.id)}
          isInCart={cartSet.has(item.course.id)}
          onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        />
      ))}
    </div>
  )
}

interface FavouriteCardProps {
  item: FavouriteCourse
  isEnrolled: boolean
  isInCart: boolean
  onRemove: (id: string) => void
}

function FavouriteCard({ item, isEnrolled, isInCart, onRemove }: FavouriteCardProps) {
  const [isPending, startTransition] = useTransition()
  const course = item.course
  const price = Number(course.price)
  const discountPrice = course.discountPrice ? Number(course.discountPrice) : null
  const rating = Number(course.averageRating)

  function handleRemove() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/favourites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        })

        if (!res.ok) {
          throw new Error("Failed to remove from favourites")
        }

        onRemove(item.id)
        toast.success("Removed from favourites")
      } catch {
        toast.error("Failed to remove from favourites")
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <Link href={`/courses/${course.slug}`}>
        <div className="relative aspect-video">
          <Image
            src={course.thumbnail || "/images/placeholder-course.jpg"}
            alt={course.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
      </Link>
      <CardContent className="p-4 space-y-3">
        <Link href={`/courses/${course.slug}`}>
          <h3 className="font-semibold line-clamp-2 hover:text-primary">
            {course.title}
          </h3>
        </Link>
        <Link
          href={`/instructors/${course.instructor.id}`}
          className="text-sm text-muted-foreground hover:text-primary hover:underline inline-block"
        >
          {course.instructor.name}
        </Link>
        <div className="flex items-center gap-2">
          <StarRating rating={rating} size="sm" showValue />
          <span className="text-sm text-muted-foreground">
            ({course.totalReviews.toLocaleString()})
          </span>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{course.totalStudents.toLocaleString()} students</span>
        </div>
        <div className="flex items-center gap-2">
          {course.isFree ? (
            <span className="font-bold text-lg">Free</span>
          ) : (
            <>
              <span className="font-bold text-lg">
                {formatPrice(discountPrice ?? price)}
              </span>
              {discountPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(price)}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {isEnrolled ? (
            <Button className="flex-1" asChild>
              <Link href={`/my-courses/${course.id}`}>
                Continue Learning
              </Link>
            </Button>
          ) : course.isFree ? (
            <Button className="flex-1" asChild>
              <Link href={`/courses/${course.slug}/enroll`}>
                Enroll for Free
              </Link>
            </Button>
          ) : (
            <div className="flex-1">
              <AddToCartButton
                courseId={course.id}
                initialInCart={isInCart}
                variant="full"
                className="h-9 text-sm"
              />
            </div>
          )}
          <Button
            variant="outline"
            size="icon"
            onClick={handleRemove}
            disabled={isPending}
            aria-label="Remove from favourites"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
