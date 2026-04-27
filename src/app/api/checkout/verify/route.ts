import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getStripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json(
        { message: "Session ID is required" },
        { status: 400 }
      )
    }

    // Retrieve the Stripe checkout session
    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId)

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json(
        { message: "Payment not completed" },
        { status: 400 }
      )
    }

    const metadata = checkoutSession.metadata || {}

    // Verify the session belongs to this user
    if (metadata.userId !== session.user.id) {
      return NextResponse.json(
        { message: "Session does not belong to this user" },
        { status: 403 }
      )
    }

    // Cart checkout (multiple courses)
    if (metadata.cartCheckout === "true" && metadata.courseIds) {
      const result = await fulfillCartPurchase(
        checkoutSession,
        session.user.id,
        metadata.courseIds
      )
      return NextResponse.json(result)
    }

    // Single course checkout
    if (metadata.courseId) {
      const result = await fulfillSinglePurchase(
        checkoutSession,
        session.user.id,
        metadata.courseId
      )
      return NextResponse.json(result)
    }

    return NextResponse.json(
      { message: "No course info in session metadata" },
      { status: 400 }
    )
  } catch (error) {
    console.error("[CHECKOUT_VERIFY]", error)
    return NextResponse.json(
      { message: "Failed to verify checkout" },
      { status: 500 }
    )
  }
}

async function fulfillSinglePurchase(
  checkoutSession: { id: string; amount_total: number | null; payment_intent: unknown },
  userId: string,
  courseId: string
) {
  // Check if enrollment already exists (idempotent)
  const existing = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  })

  if (existing) {
    return { success: true, alreadyEnrolled: true, courseId }
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
  })

  if (!course) {
    return { success: false, message: "Course not found" }
  }

  const amount = checkoutSession.amount_total || 0
  const platformFee = Math.round(amount * 0.3)
  const instructorEarning = amount - platformFee

  await prisma.$transaction([
    prisma.enrollment.create({
      data: { userId, courseId },
    }),
    prisma.purchase.create({
      data: {
        userId,
        courseId,
        amount,
        platformFee,
        instructorEarning,
        stripeSessionId: checkoutSession.id,
        stripePaymentIntentId: checkoutSession.payment_intent as string,
        status: "COMPLETED",
        courseName: course.title,
        coursePrice: course.price,
      },
    }),
    prisma.course.update({
      where: { id: courseId },
      data: { totalStudents: { increment: 1 } },
    }),
    prisma.cartItem.deleteMany({
      where: { userId, courseId },
    }),
  ])

  return { success: true, courseId }
}

async function fulfillCartPurchase(
  checkoutSession: { id: string; amount_total: number | null; payment_intent: unknown },
  userId: string,
  courseIdsStr: string
) {
  const courseIds = courseIdsStr.split(",").filter(Boolean)

  // Check which courses are already enrolled (idempotent)
  const existingEnrollments = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true },
  })
  const enrolledSet = new Set(existingEnrollments.map((e) => e.courseId))
  const newCourseIds = courseIds.filter((id) => !enrolledSet.has(id))

  if (newCourseIds.length === 0) {
    return { success: true, alreadyEnrolled: true, courseIds }
  }

  const courses = await prisma.course.findMany({
    where: { id: { in: newCourseIds } },
  })

  if (courses.length === 0) {
    return { success: false, message: "No courses found" }
  }

  const operations = []

  for (const course of courses) {
    const coursePrice = course.discountPrice
      ? Number(course.discountPrice)
      : Number(course.price)
    const courseAmount = Math.round(coursePrice * 100)
    const platformFee = Math.round(courseAmount * 0.3)
    const instructorEarning = courseAmount - platformFee

    operations.push(
      prisma.enrollment.create({
        data: { userId, courseId: course.id },
      })
    )

    const paymentIntentId = checkoutSession.payment_intent
      ? `${checkoutSession.payment_intent}_${course.id}`
      : null

    operations.push(
      prisma.purchase.create({
        data: {
          userId,
          courseId: course.id,
          amount: courseAmount,
          platformFee,
          instructorEarning,
          stripeSessionId: checkoutSession.id,
          stripePaymentIntentId: paymentIntentId,
          status: "COMPLETED",
          courseName: course.title,
          coursePrice: course.price,
        },
      })
    )

    operations.push(
      prisma.course.update({
        where: { id: course.id },
        data: { totalStudents: { increment: 1 } },
      })
    )
  }

  // Clear cart
  operations.push(
    prisma.cartItem.deleteMany({
      where: { userId },
    })
  )

  await prisma.$transaction(operations)

  return { success: true, courseIds: courses.map((c) => c.id) }
}
