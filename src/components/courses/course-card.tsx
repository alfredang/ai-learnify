import Link from "next/link"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/shared/star-rating"
import { Users, BookOpen } from "lucide-react"
import { FavouriteButton } from "@/components/courses/favourite-button"
import { CoursePriceTag } from "@/components/courses/course-price-tag"
import { CourseThumbnail } from "@/components/courses/course-thumbnail"
import { plural } from "@/lib/course-format"
import type { CourseWithInstructor } from "@/types"

interface CourseCardProps {
  course: CourseWithInstructor
  isFavourited?: boolean
  isInCart?: boolean
  isOwned?: boolean
  progress?: number
  showFavourite?: boolean
  showCartButton?: boolean
}

export function CourseCard({
  course,
  isFavourited,
  isOwned,
  progress = 0,
  showFavourite = true,
}: CourseCardProps) {
  const rating = Number(course.averageRating)

  return (
    <Card className="group relative h-full overflow-hidden transition-shadow hover:shadow-lg flex flex-col py-0">
      <div className="relative aspect-video">
        <CourseThumbnail src={course.thumbnail} title={course.title} />
        {course.isFeatured && (
          <Badge className="absolute bottom-2 left-2 bg-yellow-500">
            Bestseller
          </Badge>
        )}
        {showFavourite && (
          <div className="absolute top-2 right-2 z-10">
            <FavouriteButton courseId={course.id} initialFavourited={isFavourited} />
          </div>
        )}
      </div>
      <CardContent className="p-4 flex-1">
        <h3 className="font-semibold text-base leading-snug line-clamp-2 mb-1">
          <Link href={`/courses/${course.slug}`} className="after:absolute after:inset-0">
            {course.title}
          </Link>
        </h3>
        {/* Spec §1 step 2 — short description on every card. */}
        {course.subtitle && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {course.subtitle}
          </p>
        )}
        {/* Phase 2: Partner name + logo (spec §4.2 card field) */}
        {course.partnerName ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            {course.partnerLogoUrl && (
              <img
                src={course.partnerLogoUrl}
                alt={course.partnerName}
                className="h-5 w-5 object-contain shrink-0"
              />
            )}
            <span>
              by{" "}
              <span className="font-medium text-foreground/80">
                {course.partnerName}
              </span>
            </span>
          </div>
        ) : (
          <Link
            href={`/instructors/${course.instructor.id}`}
            className="relative z-10 text-sm text-muted-foreground mb-2 hover:text-primary hover:underline inline-block"
          >
            {course.instructor.name}
          </Link>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {course.totalReviews > 0 ? (
            <span className="flex items-center gap-1.5">
              <StarRating rating={rating} size="sm" showValue />
              <span>({course.totalReviews.toLocaleString()})</span>
            </span>
          ) : (
            <Badge variant="outline" className="text-[11px] font-medium">New</Badge>
          )}
          {course.totalStudents > 0 && (
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(course.totalStudents, "learner")}
            </span>
          )}
        </div>
        {/* Phase 2: CPD badge (spec §4.2) */}
        {course.cpdCatalog && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs font-medium border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300">
              {course.cpdCatalog.name} · {Number(course.cpdCatalog.points)} CPD
            </Badge>
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="flex items-center justify-end w-full">
          {isOwned ? (
            <>
              <span className="mr-auto text-xs font-medium text-muted-foreground">{progress}% complete</span>
              <Button size="sm" className="relative z-10 rounded-full text-xs bg-emerald-600 text-white hover:bg-emerald-500 hover:text-white" asChild>
                <Link href={`/my-courses/${course.id}`}>
                  <BookOpen className="mr-1 h-3.5 w-3.5" />
                  {progress > 0 ? "Continue Learning" : "Start Learning"}
                </Link>
              </Button>
            </>
          ) : (
            <>
              {/* Spec §4.2 — Fee or "Complimentary" */}
              {course.isFree || Number(course.price) === 0 ? (
                <Badge className="mr-auto bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                  Complimentary
                </Badge>
              ) : (
                <CoursePriceTag
                  className="mr-auto"
                  priceUsd={Number(course.price)}
                  discountUsd={course.discountPrice ? Number(course.discountPrice) : undefined}
                />
              )}
              <Button size="sm" variant="outline" className="relative z-10 rounded-full text-xs" asChild>
                <Link href={`/courses/${course.slug}`}>View course</Link>
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
