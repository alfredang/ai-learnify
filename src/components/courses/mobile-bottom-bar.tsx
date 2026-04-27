"use client"

import { formatPrice } from "@/lib/stripe"
import { AddToCartButton } from "@/components/courses/add-to-cart-button"
import { BuyNowButton } from "@/components/courses/buy-now-button"

interface MobileBottomBarProps {
  courseId: string
  price: number
  discountPrice: number | null
  isFree: boolean
  isInCart?: boolean
}

export function MobileBottomBar({
  courseId,
  price,
  discountPrice,
  isFree,
  isInCart,
}: MobileBottomBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4 lg:hidden">
      <div className="container flex items-center justify-between gap-4">
        <div className="flex-shrink-0">
          {isFree ? (
            <span className="text-lg font-bold">Free</span>
          ) : (
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold">
                {formatPrice(discountPrice ?? price)}
              </span>
              {discountPrice && (
                <span className="text-sm text-muted-foreground line-through">
                  {formatPrice(price)}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isFree ? (
            <BuyNowButton courseId={courseId} isFree={true} className="w-auto" />
          ) : (
            <>
              <AddToCartButton
                courseId={courseId}
                initialInCart={isInCart}
                variant="full"
                className="w-auto"
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
