"use client"

import { BuyNowButton } from "@/components/courses/buy-now-button"

interface MobileBottomBarProps {
  courseId: string
}

export function MobileBottomBar({ courseId }: MobileBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4 lg:hidden">
      <div className="container flex items-center justify-end gap-4">
        <BuyNowButton courseId={courseId} isFree={true} className="w-auto" />
      </div>
    </div>
  )
}
