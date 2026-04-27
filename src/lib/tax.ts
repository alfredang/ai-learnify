import { prisma } from "@/lib/prisma"

/**
 * Phase 9 — Spec §18 Tax & Finance.
 *
 * Tax rates live per-academy per-jurisdiction in the `TaxRate` model.
 * Each academy declares a single `taxJurisdiction` on its row; charges
 * booked against that academy apply the active TaxRate for that
 * jurisdiction.
 *
 * Amounts are basis points (bps), where 800 = 8.00%. Tax is computed on
 * the post-discount net, matching the ledger leg order in src/lib/ledger.ts
 * (§15 distribution order).
 */

export type ApplicableTax = {
  rateBps: number
  label: string | null           // "GST", "VAT", "Sales Tax"
  jurisdiction: string           // e.g. "SG", "EU-DE"
  registrationNumber: string | null
} | null

/**
 * Resolve the active tax rate for an academy. Returns null when:
 *   - the academy has no `taxJurisdiction` configured, or
 *   - no active TaxRate row exists for that jurisdiction.
 *
 * Picks the most recent rate by `appliesFrom` so rate changes can be
 * staged ahead of time without overlap.
 */
export async function getApplicableTax(academyId: string): Promise<ApplicableTax> {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      taxJurisdiction: true,
      taxRegistrationNumber: true,
    },
  })
  if (!academy?.taxJurisdiction) return null

  const rate = await prisma.taxRate.findFirst({
    where: {
      academyId,
      jurisdiction: academy.taxJurisdiction,
      isActive: true,
    },
    orderBy: { appliesFrom: "desc" },
    select: { rateBps: true, label: true, jurisdiction: true },
  })
  if (!rate) return null

  return {
    rateBps: rate.rateBps,
    label: rate.label,
    jurisdiction: rate.jurisdiction,
    registrationNumber: academy.taxRegistrationNumber,
  }
}

/**
 * Pure: compute tax in minor units against an amount + bps rate. Rounding
 * matches the inline logic previously in computeLegs.
 */
export function computeTaxMinor(amountMinor: number, rateBps: number): number {
  if (rateBps <= 0 || amountMinor <= 0) return 0
  return Math.round((amountMinor * rateBps) / 10_000)
}
