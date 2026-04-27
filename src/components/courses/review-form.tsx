"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Trash2 } from "lucide-react"
import { reviewSchema, type ReviewInput } from "@/lib/validations/course"
import { StarRating } from "@/components/shared/star-rating"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

interface ReviewFormProps {
  courseId: string
  existingReview?: {
    id: string
    rating: number
    comment: string | null
  } | null
  onReviewSubmitted?: () => void
}

export function ReviewForm({
  courseId,
  existingReview,
  onReviewSubmitted,
}: ReviewFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  const isEditing = !!existingReview

  const form = useForm<ReviewInput>({
    resolver: zodResolver(reviewSchema),
    defaultValues: {
      rating: existingReview?.rating ?? 0,
      comment: existingReview?.comment ?? "",
    },
  })

  const watchedComment = form.watch("comment") ?? ""
  const watchedRating = form.watch("rating")

  async function onSubmit(data: ReviewInput) {
    startTransition(async () => {
      try {
        const url = isEditing
          ? `/api/courses/${courseId}/reviews/${existingReview.id}`
          : `/api/courses/${courseId}/reviews`

        const res = await fetch(url, {
          method: isEditing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        const result = await res.json()

        if (!res.ok) {
          throw new Error(result.error || "Failed to submit review")
        }

        toast.success(
          isEditing
            ? "Review updated successfully"
            : "Review submitted successfully"
        )
        onReviewSubmitted?.()
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to submit review"
        )
      }
    })
  }

  async function handleDelete() {
    startTransition(async () => {
      try {
        const res = await fetch(
          `/api/courses/${courseId}/reviews/${existingReview!.id}`,
          { method: "DELETE" }
        )

        const result = await res.json()

        if (!res.ok) {
          throw new Error(result.error || "Failed to delete review")
        }

        toast.success("Review deleted successfully")
        setDeleteOpen(false)
        form.reset({ rating: 0, comment: "" })
        onReviewSubmitted?.()
        router.refresh()
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to delete review"
        )
      }
    })
  }

  return (
    <div className="space-y-4">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="rating"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  {isEditing ? "Update your rating" : "Select Rating"}
                </FormLabel>
                <FormControl>
                  <div className="flex items-center gap-3">
                    <StarRating
                      rating={field.value}
                      size="lg"
                      interactive
                      onRatingChange={field.onChange}
                    />
                    {field.value > 0 && (
                      <span className="text-sm text-muted-foreground">
                        {field.value === 1
                          ? "Awful"
                          : field.value === 2
                            ? "Poor"
                            : field.value === 3
                              ? "Average"
                              : field.value === 4
                                ? "Good"
                                : "Excellent"}
                      </span>
                    )}
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="comment"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-base font-medium">
                  Review (optional)
                </FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Share your experience with this course..."
                    className="min-h-[100px] resize-y"
                    disabled={isPending}
                    {...field}
                    value={field.value ?? ""}
                  />
                </FormControl>
                <div className="flex justify-between">
                  <FormMessage />
                  <span className="text-xs text-muted-foreground ml-auto">
                    {watchedComment.length} / 1000
                  </span>
                </div>
              </FormItem>
            )}
          />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={isPending || watchedRating === 0}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Review" : "Submit Review"}
            </Button>

            {isEditing && (
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" size="icon">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Review</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete your review? This action
                      cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setDeleteOpen(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isPending}
                    >
                      {isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </form>
      </Form>
    </div>
  )
}
