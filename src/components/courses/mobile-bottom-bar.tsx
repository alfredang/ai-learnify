"use client"

import { EnrolCta } from "@/components/courses/enrol-cta"

interface MobileBottomBarProps {
  courseId: string
  courseSlug: string
  isFree: boolean
  isEnrolled: boolean
  priceLabel: string
  startHref: string | null
  hasProgress?: boolean
  progress?: number
}

/**
 * Fixed action bar on small screens so the enrol / continue action is
 * always one tap away while the learner scrolls the course details.
 */
export function MobileBottomBar({
  courseId,
  courseSlug,
  isFree,
  isEnrolled,
  priceLabel,
  startHref,
  hasProgress,
  progress = 0,
}: MobileBottomBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="container flex items-center gap-3 py-3">
        <div className="min-w-0 flex-1">
          {isEnrolled ? (
            <>
              <p className="text-xs text-muted-foreground">Your progress</p>
              <p className="text-sm font-semibold">{progress}% complete</p>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{isFree ? "Access" : "Course fee"}</p>
              <p className="text-base font-bold leading-tight">{priceLabel}</p>
            </>
          )}
        </div>
        <EnrolCta
          courseId={courseId}
          courseSlug={courseSlug}
          isFree={isFree}
          isEnrolled={isEnrolled}
          startHref={startHref}
          hasProgress={hasProgress}
          size="default"
          className="w-auto shrink-0 px-5"
        />
      </div>
    </div>
  )
}
