import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeLegs } from "@/lib/ledger"
import { validatePromoCode } from "@/lib/promo-codes"
import { getApplicableTax } from "@/lib/tax"

const schema = z.object({
  productType: z.enum(["COURSE", "PROGRAMME"]),
  productId: z.string().cuid(),
  promoCode: z.string().optional().nullable(),
})

// Phase 4: quote endpoint called from the cart / checkout UI to preview
// the discount + ledger split before actually redirecting to Stripe.
// Does not mutate.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const { productType, productId, promoCode } = parsed.data

  let grossMinor = 0
  let academyId = ""
  let developerUserId = ""
  let currency = "USD"
  let productName = ""

  if (productType === "COURSE") {
    const course = await prisma.course.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        price: true,
        discountPrice: true,
        currency: true,
        academyId: true,
        instructorId: true,
      },
    })
    if (!course || !course.academyId) {
      return NextResponse.json({ error: "Course not found" }, { status: 404 })
    }
    const price = course.discountPrice ?? course.price
    grossMinor = Math.round(Number(price) * 100)
    academyId = course.academyId
    developerUserId = course.instructorId
    currency = course.currency
    productName = course.title
  } else {
    const programme = await prisma.programme.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        price: true,
        currency: true,
        academyId: true,
        courses: { take: 1, select: { course: { select: { instructorId: true } } } },
      },
    })
    if (!programme) {
      return NextResponse.json({ error: "Programme not found" }, { status: 404 })
    }
    grossMinor = Math.round(Number(programme.price) * 100)
    academyId = programme.academyId
    developerUserId = programme.courses[0]?.course.instructorId ?? ""
    currency = programme.currency
    productName = programme.title
  }

  let promoInfo: Awaited<ReturnType<typeof validatePromoCode>> | null = null
  let marketerBps = 0
  let discountBps = 0
  let marketerUserId: string | null = null
  if (promoCode) {
    promoInfo = await validatePromoCode(promoCode, academyId)
    if (promoInfo.ok) {
      marketerBps = promoInfo.marketerCommissionBps
      discountBps = promoInfo.learnerDiscountBps
      marketerUserId = promoInfo.marketerUserId
    }
  }

  // Spec §18: resolve tax via the shared tax lib so invoice rendering and
  // checkout quote stay in sync.
  const tax = await getApplicableTax(academyId)
  const taxBps = tax?.rateBps ?? 0

  const settings = await prisma.platformSettings.findFirst()

  const dist = computeLegs({
    academyId,
    productType,
    productId,
    userId: session.user.id,
    grossMinor,
    currency,
    marketerCommissionBps: marketerBps,
    learnerDiscountBps: discountBps,
    marketerUserId,
    developerUserId,
    taxBps,
    taxJurisdiction: tax?.jurisdiction,
    platformSupportFixedFeeMinor: settings?.platformSupportFixedFeeMinor ?? 50,
  })

  return NextResponse.json({
    productName,
    currency,
    grossMinor: dist.grossMinor,
    discountMinor: dist.discountMinor,
    taxMinor: dist.taxMinor,
    netMinor: dist.grossMinor - dist.discountMinor + dist.taxMinor,
    breakdown: {
      marketerMinor: dist.marketerMinor,
      platformSupportMinor: dist.platformSupportMinor,
      academyMinor: dist.academyMinor,
      developerMinor: dist.developerMinor,
    },
    promo: promoCode
      ? promoInfo?.ok
        ? { ok: true as const, code: promoInfo.code, discountBps, marketerBps }
        : { ok: false as const, reason: promoInfo?.reason ?? "NOT_FOUND" }
      : null,
    tax: tax
      ? {
          jurisdiction: tax.jurisdiction,
          label: tax.label,
          rateBps: tax.rateBps,
          registrationNumber: tax.registrationNumber,
        }
      : null,
  })
}
