"use client"

import { useState, useTransition, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { StarRating } from "@/components/shared/star-rating"
import { EmptyState } from "@/components/shared/empty-state"
import { Badge } from "@/components/ui/badge"
import { ShoppingCart, Trash2, Users, Loader2, AlertTriangle, X } from "lucide-react"
import { formatPrice } from "@/lib/stripe"
import { toast } from "sonner"
import type { CartItemCourse } from "@/types"

interface CartQuote {
  currency: string
  subtotalMinor: number
  discountMinor: number
  taxMinor: number
  totalMinor: number
  promo:
    | { ok: true; code: string; discountBps: number }
    | { ok: false; reason: string }
    | null
  tax: {
    jurisdiction: string
    label: string | null
    rateBps: number
    registrationNumber: string | null
  } | null
}

interface CartGridProps {
  initialItems: CartItemCourse[]
  enrolledCourseIds: string[]
}

export function CartGrid({ initialItems, enrolledCourseIds }: CartGridProps) {
  const [items, setItems] = useState(initialItems)
  const [isCheckingOut, setIsCheckingOut] = useState(false)
  const [promoInput, setPromoInput] = useState("")
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null)
  const [quote, setQuote] = useState<CartQuote | null>(null)
  const [isQuoting, setIsQuoting] = useState(false)
  const router = useRouter()
  const enrolledSet = new Set(enrolledCourseIds)

  // Filter out any courses the user is already enrolled in
  const validItems = items.filter((item) => !enrolledSet.has(item.course.id))

  const originalPrice = validItems.reduce((sum, item) => {
    return item.course.isFree ? sum : sum + Number(item.course.price)
  }, 0)

  const paidItems = validItems.filter((item) => !item.course.isFree)
  const freeItems = validItems.filter((item) => item.course.isFree)
  const hasUnpublished = validItems.some((item) => item.course.status !== "PUBLISHED")

  // Subtotal (pre-discount, pre-tax) shown when there's no live quote.
  const fallbackSubtotal = paidItems.reduce((sum, item) => {
    const price = item.course.discountPrice
      ? Number(item.course.discountPrice)
      : Number(item.course.price)
    return sum + price
  }, 0)

  const fetchQuote = useCallback(
    async (promo: string | null) => {
      if (paidItems.length === 0) {
        setQuote(null)
        return
      }
      setIsQuoting(true)
      try {
        const res = await fetch("/api/cart/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courseIds: paidItems.map((i) => i.course.id),
            promoCode: promo || undefined,
          }),
        })
        if (!res.ok) {
          setQuote(null)
          return
        }
        const data = (await res.json()) as CartQuote
        setQuote(data)
      } catch {
        setQuote(null)
      } finally {
        setIsQuoting(false)
      }
    },
    // paidItems is derived from items each render; tracking item ids is
    // enough for fresh-data correctness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map((i) => i.id).join(",")]
  )

  // Re-quote whenever cart contents or applied promo change.
  useEffect(() => {
    fetchQuote(appliedPromo)
  }, [fetchQuote, appliedPromo])

  function handleApplyPromo() {
    const code = promoInput.trim().toUpperCase()
    if (!code) return
    setAppliedPromo(code)
  }

  function handleRemovePromo() {
    setAppliedPromo(null)
    setPromoInput("")
  }

  // The actual amount the learner will be charged, in major currency units.
  const totalPrice = quote
    ? quote.totalMinor / 100
    : fallbackSubtotal

  async function refreshCartPrices() {
    try {
      const res = await fetch("/api/cart")
      if (!res.ok) return
      const data = await res.json()
      setItems(data.cartItems)
    } catch {
      // silent — page can be reloaded manually
    }
  }

  async function handleCheckout() {
    if (paidItems.length === 0 && freeItems.length === 0) return

    // Build expected prices so the API can validate nothing changed
    const expectedPrices: Record<string, number> = {}
    for (const item of validItems) {
      if (!item.course.isFree) {
        expectedPrices[item.course.id] = item.course.discountPrice
          ? Number(item.course.discountPrice)
          : Number(item.course.price)
      }
    }

    setIsCheckingOut(true)
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartCheckout: true,
          courseIds: validItems.map((item) => item.course.id),
          expectedPrices,
          promoCode: appliedPromo,
        }),
      })

      // Parse response defensively. Older Next.js dev errors and edge
      // failures can return a 5xx with an empty body — calling res.json()
      // blindly throws "Unexpected end of JSON input", masking the real
      // problem with a cryptic stack-trace toast.
      const text = await res.text()
      let data: { url?: string; message?: string; code?: string; free?: boolean } = {}
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          data = { message: text.slice(0, 200) }
        }
      }

      if (!res.ok) {
        if (data.code === "PRICE_CHANGED") {
          toast.error("Some course prices have changed. Please review the updated prices.")
          await refreshCartPrices()
          setIsCheckingOut(false)
          return
        }
        if (data.code === "STRIPE_NOT_CONFIGURED") {
          toast.error(
            "Payment isn't enabled on this site yet. Contact the administrator to set up Stripe."
          )
          setIsCheckingOut(false)
          return
        }
        throw new Error(
          data.message || `Checkout failed (${res.status})`
        )
      }

      if (data.free) {
        toast.success("Enrolled successfully")
        router.push("/my-courses")
        router.refresh()
      } else if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error("Checkout session returned no URL")
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to checkout"
      )
      setIsCheckingOut(false)
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        description="Browse courses and add them to your cart"
        actionLabel="Browse Courses"
        actionHref="/courses"
      />
    )
  }

  return (
    <div className="lg:grid lg:grid-cols-[1fr_360px] gap-8">
      {/* Cart items */}
      <div>
        <p className="text-muted-foreground mb-4">
          {validItems.length} {validItems.length === 1 ? "course" : "courses"} in cart
        </p>
        <div className="space-y-4">
          {validItems.map((item) => (
            <CartItemCard
              key={item.id}
              item={item}
              onRemove={(id) =>
                setItems((prev) => prev.filter((i) => i.id !== id))
              }
            />
          ))}
        </div>
      </div>

      {/* Order summary */}
      <div>
        <Card className="sticky top-20">
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold">Total:</h2>
            <div className="space-y-1">
              <div className="text-3xl font-bold">
                {formatPrice(totalPrice)}
              </div>
              {originalPrice > totalPrice && (
                <div className="text-sm text-muted-foreground line-through">
                  {formatPrice(originalPrice)}
                </div>
              )}
            </div>

            <Separator />

            {/* Per-course list */}
            {paidItems.length > 0 && (
              <div className="space-y-1 text-sm">
                {paidItems.map((item) => {
                  const itemPrice = item.course.discountPrice
                    ? Number(item.course.discountPrice)
                    : Number(item.course.price)
                  return (
                    <div key={item.id} className="flex justify-between">
                      <span className="truncate mr-2">{item.course.title}</span>
                      <span className="flex-shrink-0">{formatPrice(itemPrice)}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {freeItems.length > 0 && (
              <div className="space-y-1 text-sm">
                {freeItems.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span className="truncate mr-2">{item.course.title}</span>
                    <span className="flex-shrink-0 text-green-600">Free</span>
                  </div>
                ))}
              </div>
            )}

            <Separator />

            {/* Promo code input */}
            {paidItems.length > 0 && (
              <div className="space-y-2">
                {!appliedPromo || (quote?.promo && quote.promo.ok === false) ? (
                  <>
                    <label className="text-xs font-medium text-muted-foreground">
                      Promo code
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={promoInput}
                        onChange={(e) => setPromoInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleApplyPromo()
                          }
                        }}
                        placeholder="ENTER CODE"
                        className="h-9 text-sm uppercase border-foreground/30"
                        disabled={isQuoting}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleApplyPromo}
                        disabled={isQuoting || !promoInput.trim()}
                      >
                        Apply
                      </Button>
                    </div>
                    {quote?.promo && quote.promo.ok === false && (
                      <p className="text-xs text-destructive">
                        {(() => {
                          switch (quote.promo.reason) {
                            case "NOT_FOUND":
                              return "That code doesn't exist."
                            case "INACTIVE":
                              return "That code is no longer active."
                            case "EXPIRED":
                              return "That code has expired."
                            case "EXHAUSTED":
                              return "That code has been fully redeemed."
                            case "WRONG_ACADEMY":
                              return "That code doesn't apply to courses in this cart."
                            default:
                              return "That code is not valid."
                          }
                        })()}
                      </p>
                    )}
                  </>
                ) : (
                  quote?.promo &&
                  quote.promo.ok && (
                    <div className="flex items-center justify-between rounded-md border border-green-300 bg-green-50 p-2 text-sm dark:border-green-800 dark:bg-green-950/20">
                      <span className="text-green-700 dark:text-green-300">
                        <span className="font-mono font-semibold">
                          {quote.promo.code}
                        </span>{" "}
                        applied — {quote.promo.discountBps / 100}% off
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={handleRemovePromo}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                )}
              </div>
            )}

            {/* Line items: subtotal / discount / tax / total */}
            {quote && (
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(quote.subtotalMinor / 100)}</span>
                </div>
                {quote.discountMinor > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>
                      Discount
                      {quote.promo && quote.promo.ok && (
                        <span className="ml-1 font-mono text-xs">
                          ({quote.promo.code})
                        </span>
                      )}
                    </span>
                    <span>−{formatPrice(quote.discountMinor / 100)}</span>
                  </div>
                )}
                {quote.tax && quote.taxMinor > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {quote.tax.label ?? "Tax"} ({quote.tax.rateBps / 100}%)
                    </span>
                    <span>{formatPrice(quote.taxMinor / 100)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatPrice(quote.totalMinor / 100)}</span>
                </div>
              </div>
            )}

            {hasUnpublished && (
              <div className="flex gap-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  Some courses in your cart have been unpublished by the instructor. You may still purchase them, but content updates are not guaranteed.
                </span>
              </div>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={handleCheckout}
              disabled={isCheckingOut || validItems.length === 0}
            >
              {isCheckingOut ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Checkout"
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              30-Day Money-Back Guarantee
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

interface CartItemCardProps {
  item: CartItemCourse
  onRemove: (id: string) => void
}

function CartItemCard({ item, onRemove }: CartItemCardProps) {
  const [isPending, startTransition] = useTransition()
  const course = item.course
  const price = Number(course.price)
  const discountPrice = course.discountPrice ? Number(course.discountPrice) : null
  const rating = Number(course.averageRating)

  function handleRemove() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/cart?courseId=${course.id}`, {
          method: "DELETE",
        })

        if (!res.ok) {
          throw new Error("Failed to remove from cart")
        }

        onRemove(item.id)
        toast.success("Removed from cart")
      } catch {
        toast.error("Failed to remove from cart")
      }
    })
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Link
            href={`/courses/${course.slug}`}
            className="flex-shrink-0"
          >
            <div className="relative w-32 h-20 sm:w-44 sm:h-28 rounded overflow-hidden">
              <Image
                src={course.thumbnail || "/images/placeholder-course.jpg"}
                alt={course.title}
                fill
                className="object-cover"
                sizes="176px"
              />
            </div>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <Link href={`/courses/${course.slug}`} className="min-w-0">
                    <h3 className="font-semibold line-clamp-2 hover:text-primary">
                      {course.title}
                    </h3>
                  </Link>
                  {course.status !== "PUBLISHED" && (
                    <Badge variant="outline" className="flex-shrink-0 px-2 py-0.5 text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-200 dark:border-amber-800 dark:bg-amber-950/20">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Unpublished
                    </Badge>
                  )}
                </div>
                <Link
                  href={`/instructors/${course.instructor.id}`}
                  className="text-sm text-muted-foreground mt-1 hover:text-primary hover:underline inline-block"
                >
                  {course.instructor.name}
                </Link>
                <div className="flex items-center gap-2 mt-1">
                  <StarRating rating={rating} size="sm" showValue />
                  <span className="text-sm text-muted-foreground">
                    ({course.totalReviews.toLocaleString()})
                  </span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                  <Users className="h-3.5 w-3.5" />
                  <span>{course.totalStudents.toLocaleString()} students</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <div className="text-right">
                  {course.isFree ? (
                    <span className="font-bold text-green-600">Free</span>
                  ) : (
                    <>
                      <div className="font-bold">
                        {formatPrice(discountPrice ?? price)}
                      </div>
                      {discountPrice && (
                        <div className="text-sm text-muted-foreground line-through">
                          {formatPrice(price)}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
