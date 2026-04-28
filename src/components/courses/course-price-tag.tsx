"use client"

import { cn } from "@/lib/utils"
import { formatCurrency } from "@/lib/currency"
import { useCurrency } from "@/providers/currency-provider"

interface CoursePriceTagProps {
  priceUsd: number
  discountUsd?: number
  className?: string
}

export function CoursePriceTag({ priceUsd, discountUsd, className }: CoursePriceTagProps) {
  const { currency } = useCurrency()
  const effective = discountUsd ?? priceUsd
  return (
    <span className={cn("font-semibold text-base", className)}>
      {formatCurrency(effective, currency)}
    </span>
  )
}
