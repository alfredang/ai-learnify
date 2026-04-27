import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validatePromoCode } from "@/lib/promo-codes"
import { getApplicableTax, computeTaxMinor } from "@/lib/tax"

const schema = z.object({
  courseIds: z.array(z.string().cuid()).min(1),
  promoCode: z.string().trim().min(1).optional().nullable(),
})

// Spec §9 — aggregate cart quote. Returns subtotal, promo discount,
// tax, and grand total in one shot so the cart UI can render line items
// before the user is sent to Stripe. Pure; never mutates.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const { courseIds, promoCode } = parsed.data

  const courses = await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: {
      id: true,
      price: true,
      discountPrice: true,
      currency: true,
      isFree: true,
      academyId: true,
    },
  })

  // Cart minor-unit subtotal (paid courses only). All amounts in minor units.
  let subtotalMinor = 0
  const currency = courses.find((c) => !c.isFree)?.currency ?? "USD"
  const academyIds = new Set<string>()
  for (const c of courses) {
    if (c.isFree) continue
    const price = c.discountPrice ? Number(c.discountPrice) : Number(c.price)
    subtotalMinor += Math.round(price * 100)
    if (c.academyId) academyIds.add(c.academyId)
  }

  // Promo validates against a single academy. Pick the academy of the
  // first paid course; if the cart spans multiple academies, the promo
  // is rejected unless it matches that academy.
  let promoInfo: Awaited<ReturnType<typeof validatePromoCode>> | null = null
  let discountMinor = 0
  if (promoCode && academyIds.size > 0) {
    const primaryAcademyId = courses.find((c) => !c.isFree && c.academyId)
      ?.academyId as string
    promoInfo = await validatePromoCode(promoCode, primaryAcademyId)
    if (promoInfo.ok) {
      discountMinor = Math.round(
        (subtotalMinor * promoInfo.learnerDiscountBps) / 10_000
      )
    }
  }

  // Tax on the post-discount net. Resolve via the primary academy.
  const primaryAcademyId = courses.find((c) => !c.isFree && c.academyId)
    ?.academyId
  const tax = primaryAcademyId
    ? await getApplicableTax(primaryAcademyId)
    : null
  const taxMinor = tax
    ? computeTaxMinor(subtotalMinor - discountMinor, tax.rateBps)
    : 0

  return NextResponse.json({
    currency,
    subtotalMinor,
    discountMinor,
    taxMinor,
    totalMinor: subtotalMinor - discountMinor + taxMinor,
    promo: promoCode
      ? promoInfo?.ok
        ? {
            ok: true as const,
            code: promoInfo.code,
            discountBps: promoInfo.learnerDiscountBps,
          }
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
