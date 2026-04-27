import Stripe from "stripe"

let _stripe: Stripe | null = null

export class StripeNotConfiguredError extends Error {
  code = "STRIPE_NOT_CONFIGURED" as const
  constructor() {
    super(
      "Stripe is not configured on this environment. Add STRIPE_SECRET_KEY to .env to enable paid checkout."
    )
    this.name = "StripeNotConfiguredError"
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe() {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new StripeNotConfiguredError()
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
      typescript: true,
    })
  }
  return _stripe
}

interface CreateCheckoutSessionParams {
  courseId: string
  courseSlug: string
  courseName: string
  coursePrice: number
  courseImage?: string
  userId: string
  userEmail: string
}

export async function createCheckoutSession({
  courseId,
  courseSlug,
  courseName,
  coursePrice,
  courseImage,
  userId,
  userEmail,
}: CreateCheckoutSessionParams) {
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: userEmail,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: courseName,
            images: courseImage ? [courseImage] : [],
          },
          unit_amount: Math.round(coursePrice * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      courseId,
      userId,
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${courseSlug}?canceled=true`,
  })

  return session
}

interface CartCheckoutItem {
  courseId: string
  courseName: string
  coursePrice: number
  courseImage?: string
}

interface CreateCartCheckoutSessionParams {
  items: CartCheckoutItem[]
  userId: string
  userEmail: string
  promoCodeId?: string | null
}

export async function createCartCheckoutSession({
  items,
  userId,
  userEmail,
  promoCodeId,
}: CreateCartCheckoutSessionParams) {
  const line_items = items.map((item) => ({
    price_data: {
      currency: "usd",
      product_data: {
        name: item.courseName,
        images: item.courseImage ? [item.courseImage] : [],
      },
      unit_amount: Math.round(item.coursePrice * 100),
    },
    quantity: 1,
  }))

  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: userEmail,
    line_items,
    metadata: {
      courseIds: items.map((i) => i.courseId).join(","),
      userId,
      cartCheckout: "true",
      ...(promoCodeId ? { promoCodeId } : {}),
    },
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/cart?canceled=true`,
  })

  return session
}

export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price)
}

export function calculatePlatformFee(amount: number): number {
  return Math.round(amount * 0.3)
}

export function calculateInstructorEarning(amount: number): number {
  return Math.round(amount * 0.7)
}
