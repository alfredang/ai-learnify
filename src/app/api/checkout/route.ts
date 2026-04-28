import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createCheckoutSession,
  createCartCheckoutSession,
  createProgrammeCheckoutSession,
  isStripeConfigured,
  StripeNotConfiguredError,
} from "@/lib/stripe"
import { validatePromoCode } from "@/lib/promo-codes"
import { grantCourseAccess, grantProgrammeAccess } from "@/lib/access"

export async function POST(request: Request) {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()

    // Cart checkout (multiple courses)
    if (body.cartCheckout && body.courseIds) {
      return handleCartCheckout(
        body.courseIds,
        session.user.id,
        session.user.email!,
        body.expectedPrices,
        body.promoCode
      )
    }

    // Programme checkout
    if (body.programmeId) {
      return handleProgrammeCheckout(
        body.programmeId,
        session.user.id,
        session.user.email!
      )
    }

    // Single course checkout (existing flow)
    const { courseId } = body

    if (!courseId) {
      return NextResponse.json(
        { message: "Course ID is required" },
        { status: 400 }
      )
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
    })

    if (!course) {
      return NextResponse.json(
        { message: "Course not found" },
        { status: 404 }
      )
    }

    // Validate price hasn't changed since the student loaded the page
    if (body.expectedPrice !== undefined && !course.isFree) {
      const currentPrice = course.discountPrice
        ? Number(course.discountPrice)
        : Number(course.price)
      if (Math.abs(currentPrice - body.expectedPrice) > 0.01) {
        return NextResponse.json(
          {
            message: "The price has changed since you loaded this page",
            code: "PRICE_CHANGED",
          },
          { status: 409 }
        )
      }
    }

    // Check if already enrolled
    const existingEnrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: { userId: session.user.id, courseId },
      },
    })

    if (existingEnrollment) {
      return NextResponse.json(
        { message: "Already enrolled in this course" },
        { status: 400 }
      )
    }

    // For free courses, create enrollment directly
    if (course.isFree) {
      await prisma.enrollment.create({
        data: {
          userId: session.user.id,
          courseId,
        },
      })

      // Spec §11.1: free enrolments still need an AccessGrant so the
      // lecture viewer's access check passes. Without it, every progress
      // write returns 403 and the learner can never complete the course.
      await grantCourseAccess(session.user.id, courseId)

      await prisma.course.update({
        where: { id: courseId },
        data: { totalStudents: { increment: 1 } },
      })

      // Remove from cart if it was there
      await prisma.cartItem.deleteMany({
        where: { userId: session.user.id, courseId },
      })

      return NextResponse.json({
        url: `/my-courses/${courseId}`,
        free: true,
      })
    }

    // Create Stripe checkout session for paid courses
    const checkoutSession = await createCheckoutSession({
      courseId,
      courseSlug: course.slug,
      courseName: course.title,
      coursePrice: Number(course.price),
      courseImage: course.thumbnail || undefined,
      userId: session.user.id,
      userEmail: session.user.email!,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error("[CHECKOUT_POST]", error)
    // Surface the Stripe-not-configured case clearly so the cart UI can
    // show "Payment is not available right now" instead of the generic
    // 'Failed to execute json on Response' toast. Use a code check rather
    // than `instanceof` because Next.js HMR can hand out a fresh class ref
    // on each reload, breaking instanceof across module boundaries.
    const code = (error as { code?: string })?.code
    if (error instanceof StripeNotConfiguredError || code === "STRIPE_NOT_CONFIGURED") {
      return NextResponse.json(
        {
          message:
            error instanceof Error
              ? error.message
              : "Stripe is not configured on this environment.",
          code: "STRIPE_NOT_CONFIGURED",
        },
        { status: 503 }
      )
    }
    return NextResponse.json(
      { message: "Failed to create checkout session" },
      { status: 500 }
    )
  }
}

async function handleCartCheckout(
  courseIds: string[],
  userId: string,
  userEmail: string,
  expectedPrices?: Record<string, number>,
  promoCode?: string | null
) {
  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return NextResponse.json(
      { message: "No courses provided" },
      { status: 400 }
    )
  }

  // Fetch all courses (allow unpublished — student may have added before it was unpublished)
  const courses = await prisma.course.findMany({
    where: {
      id: { in: courseIds },
    },
  })

  if (courses.length === 0) {
    return NextResponse.json(
      { message: "No valid courses found" },
      { status: 404 }
    )
  }

  // Validate prices haven't changed since the student loaded their cart
  if (expectedPrices && Object.keys(expectedPrices).length > 0) {
    for (const course of courses) {
      if (course.isFree) continue
      const expected = expectedPrices[course.id]
      if (expected === undefined) continue
      const currentPrice = course.discountPrice
        ? Number(course.discountPrice)
        : Number(course.price)
      if (Math.abs(currentPrice - expected) > 0.01) {
        return NextResponse.json(
          {
            message: "Course prices have changed since you loaded your cart",
            code: "PRICE_CHANGED",
          },
          { status: 409 }
        )
      }
    }
  }

  // Check for existing enrollments
  const existingEnrollments = await prisma.enrollment.findMany({
    where: {
      userId,
      courseId: { in: courseIds },
    },
    select: { courseId: true },
  })

  const enrolledIds = new Set(existingEnrollments.map((e) => e.courseId))
  const unenrolledCourses = courses.filter((c) => !enrolledIds.has(c.id))

  if (unenrolledCourses.length === 0) {
    return NextResponse.json(
      { message: "Already enrolled in all selected courses" },
      { status: 400 }
    )
  }

  // Separate free and paid courses
  const freeCourses = unenrolledCourses.filter((c) => c.isFree)
  const paidCourses = unenrolledCourses.filter((c) => !c.isFree)

  // Enroll in free courses immediately
  if (freeCourses.length > 0) {
    await prisma.$transaction([
      ...freeCourses.map((course) =>
        prisma.enrollment.create({
          data: { userId, courseId: course.id },
        })
      ),
      ...freeCourses.map((course) =>
        prisma.course.update({
          where: { id: course.id },
          data: { totalStudents: { increment: 1 } },
        })
      ),
      // Remove free courses from cart
      prisma.cartItem.deleteMany({
        where: {
          userId,
          courseId: { in: freeCourses.map((c) => c.id) },
        },
      }),
    ])

    // Free enrolments still need an AccessGrant so the lecture viewer's
    // access check passes (spec §11.1). Done outside the $transaction
    // because grantCourseAccess upserts and isn't a simple write.
    for (const course of freeCourses) {
      await grantCourseAccess(userId, course.id)
    }
  }

  // If only free courses, no need for Stripe
  if (paidCourses.length === 0) {
    // Clear remaining cart items
    await prisma.cartItem.deleteMany({
      where: { userId },
    })
    return NextResponse.json({ free: true, url: "/my-courses" })
  }

  // Validate the promo code (if any) against the academy of the first
  // paid course. The cart UI calls /api/cart/quote which uses the same
  // logic, so this is just defence-in-depth — never trust the client.
  let promoDiscountBps = 0
  let promoCodeId: string | null = null
  if (promoCode && paidCourses[0]?.academyId) {
    const result = await validatePromoCode(promoCode, paidCourses[0].academyId)
    if (result.ok) {
      promoDiscountBps = result.learnerDiscountBps
      promoCodeId = result.promoCodeId
    }
    // If invalid, silently ignore — the cart UI is responsible for
    // surfacing validation errors before checkout.
  }

  // Create Stripe checkout for paid courses, applying the promo discount
  // to each line item's unit_amount. Stripe doesn't have a "cart-level"
  // discount, so we proportionally discount each line.
  const items = paidCourses.map((course) => {
    const fullPrice = course.discountPrice
      ? Number(course.discountPrice)
      : Number(course.price)
    const discounted =
      promoDiscountBps > 0
        ? Math.max(0, fullPrice * (1 - promoDiscountBps / 10_000))
        : fullPrice
    return {
      courseId: course.id,
      courseName: course.title,
      coursePrice: discounted,
      courseImage: course.thumbnail || undefined,
    }
  })

  const checkoutSession = await createCartCheckoutSession({
    items,
    userId,
    userEmail,
    promoCodeId,
  })

  return NextResponse.json({ url: checkoutSession.url })
}

async function handleProgrammeCheckout(
  programmeId: string,
  userId: string,
  userEmail: string
) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId, status: "PUBLISHED" },
    include: {
      courses: {
        include: { course: { select: { id: true } } },
      },
    },
  })

  if (!programme) {
    return NextResponse.json(
      { message: "Programme not found" },
      { status: 404 }
    )
  }

  // Check if already has access
  const existingGrant = await prisma.accessGrant.findFirst({
    where: { userId, programmeId, productType: "PROGRAMME", isActive: true },
  })

  if (existingGrant) {
    return NextResponse.json(
      { message: "Already enrolled in this programme" },
      { status: 400 }
    )
  }

  const price = Number(programme.price)

  // Free programme — grant access immediately
  if (programme.isFree || price === 0) {
    await grantProgrammeAccess(userId, programmeId)

    // Also create enrollments for each course in the programme
    for (const pc of programme.courses) {
      const existing = await prisma.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId: pc.course.id } },
      })
      if (!existing) {
        await prisma.enrollment.create({
          data: { userId, courseId: pc.course.id },
        })
        await grantCourseAccess(userId, pc.course.id)
        await prisma.course.update({
          where: { id: pc.course.id },
          data: { totalStudents: { increment: 1 } },
        })
      }
    }

    return NextResponse.json({
      url: `/programmes/${programme.slug}/enroll?success=true`,
      free: true,
    })
  }

  // Paid programme — create Stripe checkout session
  const checkoutSession = await createProgrammeCheckoutSession({
    programmeId,
    programmeSlug: programme.slug,
    programmeName: programme.title,
    programmePrice: price,
    programmeImage: programme.thumbnail || undefined,
    userId,
    userEmail,
  })

  return NextResponse.json({ url: checkoutSession.url })
}
