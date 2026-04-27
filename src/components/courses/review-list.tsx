"use client"

import { useState, useTransition } from "react"
import { formatDistanceToNow } from "date-fns"
import { Loader2 } from "lucide-react"
import type { ReviewWithUser } from "@/types"
import { StarRating } from "@/components/shared/star-rating"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface ReviewListProps {
  courseId: string
  initialReviews: ReviewWithUser[]
  initialTotal: number
  initialTotalPages: number
}

const SORT_OPTIONS = [
  { value: "newest", label: "Most Recent" },
  { value: "highest", label: "Highest Rated" },
  { value: "lowest", label: "Lowest Rated" },
] as const

export function ReviewList({
  courseId,
  initialReviews,
  initialTotal,
  initialTotalPages,
}: ReviewListProps) {
  const [reviews, setReviews] = useState<ReviewWithUser[]>(initialReviews)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [sort, setSort] = useState("newest")
  const [isPending, startTransition] = useTransition()

  const hasMore = page < totalPages

  function handleSortChange(value: string) {
    setSort(value)
    setPage(1)
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/courses/${courseId}/reviews?page=1&sort=${value}`
        )
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        setReviews(data.reviews)
        setTotalPages(data.meta.totalPages)
      } catch {
        // Keep current state on error
      }
    })
  }

  function handleLoadMore() {
    const nextPage = page + 1
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/courses/${courseId}/reviews?page=${nextPage}&sort=${sort}`
        )
        const data = await res.json()

        if (!res.ok) throw new Error(data.error)

        setReviews((prev) => [...prev, ...data.reviews])
        setPage(nextPage)
        setTotalPages(data.meta.totalPages)
      } catch {
        // Keep current state on error
      }
    })
  }

  if (initialTotal === 0) {
    return (
      <p className="text-muted-foreground py-4">
        No reviews yet. Be the first to review this course!
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {initialTotal} {initialTotal === 1 ? "review" : "reviews"}
        </span>
        <Select value={sort} onValueChange={handleSortChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="divide-y">
        {reviews.map((review) => (
          <div key={review.id} className="py-5 first:pt-0">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={review.user.image || ""} />
                <AvatarFallback>
                  {review.user.name?.[0] || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">
                    {review.user.name}
                  </span>
                  <StarRating rating={review.rating} size="sm" />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(review.createdAt), {
                    addSuffix: true,
                  })}
                </p>
                {review.comment && (
                  <p className="mt-2 text-sm leading-relaxed">
                    {review.comment}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <Button
          variant="outline"
          className="w-full"
          onClick={handleLoadMore}
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Show More Reviews
        </Button>
      )}
    </div>
  )
}
