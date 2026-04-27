import { StarRating } from "@/components/shared/star-rating"
import { Progress } from "@/components/ui/progress"

interface RatingSummaryProps {
  averageRating: number
  totalReviews: number
  distribution: Record<number, number>
}

export function RatingSummary({
  averageRating,
  totalReviews,
  distribution,
}: RatingSummaryProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8">
      <div className="flex flex-col items-center justify-center sm:min-w-[120px]">
        <span className="text-5xl font-bold text-amber-700 dark:text-amber-500">
          {averageRating.toFixed(1)}
        </span>
        <StarRating rating={averageRating} size="md" />
        <span className="text-sm text-muted-foreground mt-1">
          Course Rating
        </span>
      </div>

      <div className="flex-1 space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = distribution[star] || 0
          const percentage = totalReviews > 0
            ? Math.round((count / totalReviews) * 100)
            : 0

          return (
            <div key={star} className="flex items-center gap-3">
              <Progress
                value={percentage}
                className="h-2.5 flex-1 bg-gray-200 dark:bg-gray-700"
              />
              <div className="flex items-center gap-1.5 min-w-[80px]">
                <StarRating rating={star} size="sm" />
              </div>
              <span className="text-sm text-muted-foreground min-w-[32px] text-right tabular-nums">
                {percentage}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
