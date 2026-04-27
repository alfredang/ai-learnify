"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import Link from "next/link"
import { ShoppingCart, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatPrice } from "@/lib/stripe"
import type { CartItemCourse } from "@/types"

export function CartDropdown() {
  const [items, setItems] = useState<CartItemCourse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  async function fetchCart() {
    if (hasFetched) return
    setIsLoading(true)
    try {
      const res = await fetch("/api/cart")
      if (res.ok) {
        const data = await res.json()
        setItems(data.cartItems || [])
      }
    } catch {
      // Silently fail
    } finally {
      setIsLoading(false)
      setHasFetched(true)
    }
  }

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
    fetchCart()
  }

  function handleMouseLeave() {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  // Refetch when dropdown opens after initial load
  useEffect(() => {
    if (isOpen && hasFetched) {
      fetch("/api/cart")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data) setItems(data.cartItems || [])
        })
        .catch(() => {})
    }
  }, [isOpen, hasFetched])

  const totalPrice = items.reduce((sum, item) => {
    const price = item.course.discountPrice
      ? Number(item.course.discountPrice)
      : Number(item.course.price)
    return item.course.isFree ? sum : sum + price
  }, 0)

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Button variant="ghost" size="icon" asChild>
        <Link href="/cart" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {items.length > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {items.length > 9 ? "9+" : items.length}
            </span>
          )}
          <span className="sr-only">Cart</span>
        </Link>
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-card shadow-xl z-50">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Your cart is empty</p>
              <Button variant="link" size="sm" asChild className="mt-2">
                <Link href="/courses">Browse courses</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto divide-y">
                {items.slice(0, 5).map((item) => {
                  const course = item.course
                  const price = Number(course.price)
                  const discountPrice = course.discountPrice
                    ? Number(course.discountPrice)
                    : null

                  return (
                    <Link
                      key={item.id}
                      href={`/courses/${course.slug}`}
                      className="flex gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="relative w-16 h-10 rounded overflow-hidden flex-shrink-0">
                        <Image
                          src={course.thumbnail || "/images/placeholder-course.jpg"}
                          alt={course.title}
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">
                          {course.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {course.instructor.name}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {course.isFree ? (
                          <span className="text-xs font-medium text-green-600">Free</span>
                        ) : (
                          <span className="text-sm font-bold">
                            {formatPrice(discountPrice ?? price)}
                          </span>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
              {items.length > 5 && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-t">
                  +{items.length - 5} more in cart
                </div>
              )}
              <div className="border-t p-3 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Total:</span>
                  <span className="text-lg font-bold">{formatPrice(totalPrice)}</span>
                </div>
                <Button className="w-full" asChild>
                  <Link href="/cart">Go to Cart</Link>
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
