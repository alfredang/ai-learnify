import { nanoid } from "nanoid"
import type {
  LedgerEntry,
  LedgerEntryType,
  PayoutGroup,
  Prisma,
  ProductType,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

/**
 * Phase 4 — IESA LMS spec §15 (Revenue & Profit Sharing, LOCKED order) +
 * §16 (Immutable ledger).
 *
 *   Distribution order applied in computeLegs():
 *     1. Marketer Commission (% of gross)
 *     2. Platform Support Fixed Fee (same for course & programme)
 *     3. Learner Discount %         (promo-code discount already subtracted from gross)
 *     4. Remaining → Academy Admin + Partner (default 50/50; configurable)
 *
 * Amounts are stored in minor units (cents) on LedgerEntry.amountMinor with
 * signs chosen so the sum across all legs of one `parentTxnId` is always zero.
 */

export type PurchaseInput = {
  academyId: string
  productType: ProductType
  productId: string
  userId: string
  /** Quoted gross in minor units before any discount/tax */
  grossMinor: number
  currency: string
  /** Optional pre-validated promo code resolving into these bps */
  marketerCommissionBps?: number
  learnerDiscountBps?: number
  marketerUserId?: string | null
  developerUserId: string
  /** bps of (gross − discount − marketer − platform_support − tax) going to developer */
  developerSplitBps?: number
  /** e.g. 800 for SG GST = 8%; zero if untaxed */
  taxBps?: number
  taxJurisdiction?: string
  platformSupportFixedFeeMinor?: number
}

export type LegSpec = {
  type: LedgerEntryType
  amountMinor: number
  payoutGroup?: PayoutGroup | null
  beneficiaryUserId?: string | null
  notes?: string
}

export type ComputedDistribution = {
  parentTxnId: string
  grossMinor: number
  discountMinor: number
  netAfterDiscount: number
  marketerMinor: number
  platformSupportMinor: number
  taxMinor: number
  academyMinor: number
  developerMinor: number
  legs: LegSpec[]
}

const DEFAULT_DEVELOPER_SPLIT_BPS = 5000

/**
 * Pure function — does not hit the DB. Returns the legs that would be
 * written if this purchase settled. Call once at quote time (for invoice
 * preview) and again at webhook time (to actually write).
 *
 * Invariant: sum of amountMinor across `legs` === 0.
 */
export function computeLegs(input: PurchaseInput): ComputedDistribution {
  const gross = Math.max(0, Math.round(input.grossMinor))
  const discountBps = input.learnerDiscountBps ?? 0
  const marketerBps = input.marketerCommissionBps ?? 0
  const devBps = input.developerSplitBps ?? DEFAULT_DEVELOPER_SPLIT_BPS
  const taxBps = input.taxBps ?? 0
  const psFixed = input.platformSupportFixedFeeMinor ?? 0

  const discount = Math.round((gross * discountBps) / 10_000)
  const netAfterDiscount = gross - discount
  const marketer = Math.round((gross * marketerBps) / 10_000)
  const platformSupport = Math.min(psFixed, Math.max(0, netAfterDiscount - marketer))
  const tax = Math.round((netAfterDiscount * taxBps) / 10_000)

  const splittable = Math.max(0, netAfterDiscount - marketer - platformSupport - tax)
  const developer = Math.round((splittable * devBps) / 10_000)
  const academy = splittable - developer // catches rounding pennies

  const parentTxnId = `TXN-${nanoid(12)}`

  const legs: LegSpec[] = []

  // 1. Learner paid the full gross.
  legs.push({
    type: "CHARGE",
    amountMinor: +gross,
    notes: "Learner charge",
  })

  // 2. Discount reduces the pool immediately.
  if (discount > 0) {
    legs.push({
      type: "DISCOUNT",
      amountMinor: -discount,
      notes: `Promo discount ${discountBps / 100}%`,
    })
  }

  // 3. Marketer commission.
  if (marketer > 0) {
    legs.push({
      type: "MARKETER",
      amountMinor: -marketer,
      payoutGroup: "MARKETER",
      beneficiaryUserId: input.marketerUserId ?? null,
      notes: `Marketer commission ${marketerBps / 100}%`,
    })
  }

  // 4. Platform Support fixed fee.
  if (platformSupport > 0) {
    legs.push({
      type: "PLATFORM_SUPPORT",
      amountMinor: -platformSupport,
      payoutGroup: "PLATFORM_SUPPORT",
      notes: `Platform support fixed fee`,
    })
  }

  // 5. Tax (collected by Academy — routed to the TAX leg so Academy can
  // remit separately in reporting; not paid out to anyone).
  if (tax > 0) {
    legs.push({
      type: "TAX",
      amountMinor: -tax,
      notes: `Tax ${input.taxJurisdiction ?? ""} ${taxBps / 100}%`.trim(),
    })
  }

  // 6. Remaining → Academy + Developer.
  if (academy > 0) {
    legs.push({
      type: "ACADEMY",
      amountMinor: -academy,
      payoutGroup: "ACADEMY",
      notes: "Academy share",
    })
  }
  if (developer > 0) {
    legs.push({
      type: "DEVELOPER",
      amountMinor: -developer,
      payoutGroup: "DEVELOPER",
      beneficiaryUserId: input.developerUserId,
      notes: "Developer share",
    })
  }

  // Invariant: if gross==0 (free course) all legs are 0 and we still return
  // a CHARGE:0 entry. Sum = 0 always.
  return {
    parentTxnId,
    grossMinor: gross,
    discountMinor: discount,
    netAfterDiscount,
    marketerMinor: marketer,
    platformSupportMinor: platformSupport,
    taxMinor: tax,
    academyMinor: academy,
    developerMinor: developer,
    legs,
  }
}

/**
 * Persist a computed distribution atomically. Returns the created entries.
 * Throws if the sum of legs isn't zero (safety net; computeLegs should
 * always balance).
 */
export async function writeLedger(
  input: PurchaseInput,
  dist: ComputedDistribution,
  tx?: Prisma.TransactionClient
): Promise<LedgerEntry[]> {
  const sum = dist.legs.reduce((acc, l) => acc + l.amountMinor, 0)
  if (sum !== 0) {
    throw new Error(
      `[ledger] unbalanced legs for ${dist.parentTxnId}: sum=${sum}. Refusing to write.`
    )
  }

  const client = tx ?? prisma

  const created: LedgerEntry[] = []
  for (const leg of dist.legs) {
    const row = await client.ledgerEntry.create({
      data: {
        parentTxnId: dist.parentTxnId,
        academyId: input.academyId,
        productType: input.productType,
        productId: input.productId,
        userId: input.userId,
        beneficiaryUserId: leg.beneficiaryUserId ?? null,
        entryType: leg.type,
        amountMinor: leg.amountMinor,
        currency: input.currency,
        payoutGroup: leg.payoutGroup ?? null,
        notes: leg.notes,
      },
    })
    created.push(row)
  }

  return created
}

/**
 * Refund a previously written transaction by emitting reversal entries.
 * Emits REFUND_* counter-entries that negate every original leg so the sum
 * across `parentTxnId` + its reversal remains zero — and stakeholder net
 * balances return to their pre-charge state (spec §14 ledger reversal).
 */
export async function reverseLedger(
  parentTxnId: string,
  tx?: Prisma.TransactionClient
): Promise<LedgerEntry[]> {
  const client = tx ?? prisma

  const original = await client.ledgerEntry.findMany({
    where: { parentTxnId },
  })
  if (original.length === 0) throw new Error(`No ledger entries for ${parentTxnId}`)

  // Already refunded? Refuse to double-reverse.
  const alreadyReversed = await client.ledgerEntry.findMany({
    where: { reversalOfId: { in: original.map((o) => o.id) } },
  })
  if (alreadyReversed.length > 0) {
    throw new Error(`Transaction ${parentTxnId} already has reversal entries`)
  }

  const reversalTypeFor: Record<LedgerEntryType, LedgerEntryType | null> = {
    CHARGE: "REFUND_CHARGE",
    DISCOUNT: "REFUND_DISCOUNT",
    ACADEMY: "REFUND_ACADEMY",
    DEVELOPER: "REFUND_DEVELOPER",
    MARKETER: "REFUND_MARKETER",
    PLATFORM_SUPPORT: "REFUND_PLATFORM",
    TAX: "REFUND_TAX",
    // Reversal entries themselves should never be reversed a second time.
    REFUND_CHARGE: null,
    REFUND_DISCOUNT: null,
    REFUND_ACADEMY: null,
    REFUND_DEVELOPER: null,
    REFUND_MARKETER: null,
    REFUND_PLATFORM: null,
    REFUND_TAX: null,
  }

  const reversalParent = `${parentTxnId}-REV`
  const created: LedgerEntry[] = []

  for (const leg of original) {
    const reverseType = reversalTypeFor[leg.entryType]
    if (!reverseType) continue
    const row = await client.ledgerEntry.create({
      data: {
        parentTxnId: reversalParent,
        academyId: leg.academyId,
        productType: leg.productType,
        productId: leg.productId,
        userId: leg.userId,
        beneficiaryUserId: leg.beneficiaryUserId,
        entryType: reverseType,
        amountMinor: -leg.amountMinor, // flip sign
        currency: leg.currency,
        payoutGroup: leg.payoutGroup,
        reversalOfId: leg.id,
        notes: `Reversal of ${leg.entryType}`,
      },
    })
    created.push(row)
  }

  await audit({
    action: "ledger.reverse",
    resourceType: "ledger",
    resourceId: parentTxnId,
    academyId: original[0].academyId,
    metadata: { reversalParent, legsReversed: created.length },
  })

  return created
}

/**
 * Integrity check used by /api/cron/ledger-invariant and the verify script.
 * For each distinct parentTxnId, asserts sum(amountMinor) === 0.
 */
export async function findUnbalancedTransactions(): Promise<
  { parentTxnId: string; sumMinor: number; legCount: number }[]
> {
  const rows: Array<{ parentTxnId: string; sumMinor: bigint; legCount: bigint }> = await prisma.$queryRaw`
    SELECT "parentTxnId",
           SUM("amountMinor")::bigint AS "sumMinor",
           COUNT(*)::bigint AS "legCount"
      FROM "LedgerEntry"
     GROUP BY "parentTxnId"
    HAVING SUM("amountMinor") <> 0
  `
  return rows.map((r) => ({
    parentTxnId: r.parentTxnId,
    sumMinor: Number(r.sumMinor),
    legCount: Number(r.legCount),
  }))
}
