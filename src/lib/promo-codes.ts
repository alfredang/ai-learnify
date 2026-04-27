import { prisma } from "@/lib/prisma"

export type PromoValidation =
  | {
      ok: true
      promoCodeId: string
      code: string
      marketerUserId: string | null
      marketerCommissionBps: number
      learnerDiscountBps: number
    }
  | { ok: false; reason: "NOT_FOUND" | "INACTIVE" | "EXPIRED" | "EXHAUSTED" | "WRONG_ACADEMY" }

/**
 * Spec §6 step 4 + §15 step 3: resolve a promo code at checkout. Never
 * mutates — validate first, then call `consumePromoCode()` atomically in
 * the webhook after payment confirmation.
 */
export async function validatePromoCode(
  code: string,
  academyId: string
): Promise<PromoValidation> {
  const promo = await prisma.promoCode.findUnique({ where: { code } })
  if (!promo) return { ok: false, reason: "NOT_FOUND" }
  if (!promo.isActive) return { ok: false, reason: "INACTIVE" }
  if (promo.academyId !== academyId) return { ok: false, reason: "WRONG_ACADEMY" }

  const now = new Date()
  if (promo.validFrom && promo.validFrom > now) return { ok: false, reason: "EXPIRED" }
  if (promo.validTo && promo.validTo < now) return { ok: false, reason: "EXPIRED" }
  if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) {
    return { ok: false, reason: "EXHAUSTED" }
  }

  return {
    ok: true,
    promoCodeId: promo.id,
    code: promo.code,
    marketerUserId: promo.marketerUserId,
    marketerCommissionBps: promo.marketerCommissionBps,
    learnerDiscountBps: promo.learnerDiscountBps,
  }
}

/**
 * Increment the usage counter. Called from the webhook after a successful
 * purchase so failed checkouts don't burn codes.
 */
export async function consumePromoCode(promoCodeId: string): Promise<void> {
  await prisma.promoCode.update({
    where: { id: promoCodeId },
    data: { usageCount: { increment: 1 } },
  })
}
