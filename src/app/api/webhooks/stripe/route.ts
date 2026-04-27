import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { finalizePurchase } from "@/lib/checkout-finalize"

export async function POST(request: Request) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get("Stripe-Signature")

  if (!signature) {
    return NextResponse.json({ message: "Missing stripe signature" }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (error) {
    console.error("Webhook signature verification failed:", error)
    return NextResponse.json(
      { message: "Webhook signature verification failed" },
      { status: 400 }
    )
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const metadata = session.metadata || {}
    const { userId } = metadata

    if (!userId) {
      return NextResponse.json({ message: "Missing userId in metadata" }, { status: 400 })
    }

    try {
      if (metadata.cartCheckout === "true" && metadata.courseIds) {
        await handleCartPurchase(session, userId, metadata)
      } else if (metadata.courseId) {
        await handleSingleCoursePurchase(session, userId, metadata)
      } else if (metadata.programmeId) {
        await handleProgrammePurchase(session, userId, metadata)
      } else {
        return NextResponse.json({ message: "Missing product info in metadata" }, { status: 400 })
      }
    } catch (error) {
      console.error("[WEBHOOK_PROCESSING]", error)
      return NextResponse.json({ message: "Error processing webhook" }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}

function parseBps(raw: string | undefined): number {
  if (!raw) return 0
  const n = parseInt(raw, 10)
  return Number.isFinite(n) ? n : 0
}

async function handleSingleCoursePurchase(
  session: Stripe.Checkout.Session,
  userId: string,
  metadata: Record<string, string>
) {
  const courseId = metadata.courseId
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      academyId: true,
      instructorId: true,
      price: true,
      discountPrice: true,
      isFree: true,
    },
  })
  if (!course) throw new Error(`Course ${courseId} not found`)
  if (!course.academyId) throw new Error(`Course ${courseId} has no academyId`)

  const grossMinor = session.amount_total ?? 0
  const currency = (session.currency ?? "usd").toUpperCase()

  await finalizePurchase({
    userId,
    academyId: course.academyId,
    productType: "COURSE",
    productId: course.id,
    grossMinor,
    currency,
    promoCodeId: metadata.promoCodeId || null,
    marketerUserId: metadata.marketerUserId || null,
    marketerCommissionBps: parseBps(metadata.marketerCommissionBps),
    learnerDiscountBps: parseBps(metadata.learnerDiscountBps),
    taxBps: parseBps(metadata.taxBps),
    taxJurisdiction: metadata.taxJurisdiction || undefined,
    developerUserId: course.instructorId,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string | null,
  })
}

async function handleProgrammePurchase(
  session: Stripe.Checkout.Session,
  userId: string,
  metadata: Record<string, string>
) {
  const programmeId = metadata.programmeId
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: {
      id: true,
      academyId: true,
      courses: { take: 1, select: { course: { select: { instructorId: true } } } },
    },
  })
  if (!programme) throw new Error(`Programme ${programmeId} not found`)

  const developerUserId =
    programme.courses[0]?.course.instructorId ?? "" // fallback; webhook still writes ledger

  const grossMinor = session.amount_total ?? 0
  const currency = (session.currency ?? "usd").toUpperCase()

  await finalizePurchase({
    userId,
    academyId: programme.academyId,
    productType: "PROGRAMME",
    productId: programme.id,
    grossMinor,
    currency,
    promoCodeId: metadata.promoCodeId || null,
    marketerUserId: metadata.marketerUserId || null,
    marketerCommissionBps: parseBps(metadata.marketerCommissionBps),
    learnerDiscountBps: parseBps(metadata.learnerDiscountBps),
    taxBps: parseBps(metadata.taxBps),
    taxJurisdiction: metadata.taxJurisdiction || undefined,
    developerUserId,
    stripeSessionId: session.id,
    stripePaymentIntentId: session.payment_intent as string | null,
  })
}

async function handleCartPurchase(
  session: Stripe.Checkout.Session,
  userId: string,
  metadata: Record<string, string>
) {
  const courseIds = (metadata.courseIds ?? "").split(",").filter(Boolean)
  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      academyId: true,
      instructorId: true,
      price: true,
      discountPrice: true,
      isFree: true,
    },
  })
  if (courses.length === 0) throw new Error("No courses found for cart checkout")

  // Cart purchases split gross proportionally across courses. Stripe line
  // items already encode the per-course amount; recover it from metadata if
  // available, else fall back to the stored price.
  const currency = (session.currency ?? "usd").toUpperCase()

  for (const course of courses) {
    if (!course.academyId) continue
    const priceDecimal = course.discountPrice ?? course.price
    const courseGrossMinor = Math.round(Number(priceDecimal) * 100)

    // Synthetic per-course payment intent so we don't idempotency-collide.
    const perIntent = session.payment_intent
      ? `${session.payment_intent}_${course.id}`
      : null

    await finalizePurchase({
      userId,
      academyId: course.academyId,
      productType: "COURSE",
      productId: course.id,
      grossMinor: courseGrossMinor,
      currency,
      promoCodeId: metadata.promoCodeId || null,
      marketerUserId: metadata.marketerUserId || null,
      marketerCommissionBps: parseBps(metadata.marketerCommissionBps),
      learnerDiscountBps: parseBps(metadata.learnerDiscountBps),
      taxBps: parseBps(metadata.taxBps),
      taxJurisdiction: metadata.taxJurisdiction || undefined,
      developerUserId: course.instructorId,
      stripeSessionId: session.id,
      stripePaymentIntentId: perIntent,
    })
  }

  await prisma.cartItem.deleteMany({ where: { userId } })
}
