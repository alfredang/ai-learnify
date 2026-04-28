import { prisma } from "@/lib/prisma"

export function formatMinor(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export type MarketerLifetime = {
  totalMinor: number
  unbatchedMinor: number
  paidMinor: number
  currency: string
}

/**
 * Spec §15/§16 — net commission earned by a marketer across the entire
 * ledger. MARKETER legs are written negative (money out of the academy
 * pool); we negate so the dollar amounts are positive in the UI.
 *
 * "Pending payable" = legs not yet attached to any payout batch.
 * "Paid" = legs whose batch has reached PAID status.
 *
 * Returned currency is whichever currency this marketer's most recent leg
 * was in. The dashboard does not yet aggregate across mixed currencies —
 * good enough while every academy operates in a single primary currency.
 */
export async function marketerLifetimeCommission(
  userId: string
): Promise<MarketerLifetime> {
  const legs = await prisma.ledgerEntry.findMany({
    where: {
      beneficiaryUserId: userId,
      entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
    },
    select: {
      amountMinor: true,
      currency: true,
      payoutBatchId: true,
      payoutBatch: { select: { status: true } },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  })

  if (legs.length === 0) {
    return { totalMinor: 0, unbatchedMinor: 0, paidMinor: 0, currency: "USD" }
  }

  const currency = legs[0].currency

  let totalSigned = 0
  let unbatchedSigned = 0
  let paidSigned = 0
  for (const l of legs) {
    if (l.currency !== currency) continue
    totalSigned += l.amountMinor
    if (!l.payoutBatchId) unbatchedSigned += l.amountMinor
    if (l.payoutBatch?.status === "PAID") paidSigned += l.amountMinor
  }

  return {
    totalMinor: -totalSigned,
    unbatchedMinor: -unbatchedSigned,
    paidMinor: -paidSigned,
    currency,
  }
}
