import type { PayoutBatch, PayoutGroup, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

/**
 * Phase 4 — IESA LMS spec §15 grouped payouts.
 *
 * Payout batches aggregate every eligible LedgerEntry (a "share" leg such as
 * MARKETER / PLATFORM_SUPPORT / ACADEMY / DEVELOPER plus its reversal twin)
 * into a single payable unit for a given (academy, group, currency, period).
 *
 * Share legs are stored as **negative** amountMinor in src/lib/ledger.ts
 * (distributions OUT of the learner's charge pool). Reversal legs flip the
 * sign so `SUM(amountMinor)` within a group nets out refunds automatically.
 * We persist `totalMinor` on the batch as the **positive** amount owed
 * (= -SUM of signed legs) so reporting and payout forms show what to pay.
 */

export type BuildPayoutBatchInput = {
  academyId: string
  payoutGroup: PayoutGroup
  periodStart: Date
  periodEnd: Date
  currency?: string
  actorUserId?: string
  notes?: string
}

export type EligibleSummary = {
  legCount: number
  totalMinor: number
  currency: string
}

export type BeneficiaryBreakdown = {
  beneficiaryUserId: string | null
  amountMinor: number
  legCount: number
}

function eligibleWhere(
  input: Pick<BuildPayoutBatchInput, "academyId" | "payoutGroup" | "periodStart" | "periodEnd" | "currency">
): Prisma.LedgerEntryWhereInput {
  return {
    academyId: input.academyId,
    payoutGroup: input.payoutGroup,
    payoutBatchId: null,
    currency: input.currency ?? "USD",
    createdAt: { gte: input.periodStart, lte: input.periodEnd },
  }
}

/**
 * Preview what would land in a batch without creating one. Powers the UI
 * period picker so an admin can see the total + per-beneficiary breakdown
 * before committing.
 */
export async function previewPayoutBatch(
  input: BuildPayoutBatchInput
): Promise<{ summary: EligibleSummary; byBeneficiary: BeneficiaryBreakdown[] }> {
  const currency = input.currency ?? "USD"
  const rows = await prisma.ledgerEntry.findMany({
    where: eligibleWhere({ ...input, currency }),
    select: { beneficiaryUserId: true, amountMinor: true },
  })

  const totalSigned = rows.reduce((a, r) => a + r.amountMinor, 0)
  const perBene = new Map<string | null, { amountMinor: number; legCount: number }>()
  for (const r of rows) {
    const prev = perBene.get(r.beneficiaryUserId) ?? { amountMinor: 0, legCount: 0 }
    prev.amountMinor += r.amountMinor
    prev.legCount += 1
    perBene.set(r.beneficiaryUserId, prev)
  }

  return {
    summary: { legCount: rows.length, totalMinor: -totalSigned, currency },
    byBeneficiary: Array.from(perBene.entries()).map(([k, v]) => ({
      beneficiaryUserId: k,
      amountMinor: -v.amountMinor,
      legCount: v.legCount,
    })),
  }
}

/**
 * Create a new PayoutBatch (status=DRAFT) and attach every eligible
 * LedgerEntry in a single transaction. The `payoutBatchId` FK on the entry
 * is the idempotency guard: once set, the leg is skipped by future builds.
 */
export async function buildPayoutBatch(
  input: BuildPayoutBatchInput
): Promise<{ batch: PayoutBatch; attached: number; totalMinor: number }> {
  const currency = input.currency ?? "USD"

  const result = await prisma.$transaction(async (tx) => {
    const eligible = await tx.ledgerEntry.findMany({
      where: eligibleWhere({ ...input, currency }),
      select: { id: true, amountMinor: true },
    })

    if (eligible.length === 0) {
      throw new Error("No eligible ledger entries in that period.")
    }

    const totalMinor = -eligible.reduce((a, e) => a + e.amountMinor, 0)
    if (totalMinor <= 0) {
      throw new Error(
        "Net owed amount is zero or negative (refunds meet or exceed shares). Nothing to pay out."
      )
    }

    const batch = await tx.payoutBatch.create({
      data: {
        academyId: input.academyId,
        payoutGroup: input.payoutGroup,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        currency,
        totalMinor,
        status: "DRAFT",
        notes: input.notes,
      },
    })

    await tx.ledgerEntry.updateMany({
      where: { id: { in: eligible.map((e) => e.id) } },
      data: { payoutBatchId: batch.id },
    })

    return { batch, attached: eligible.length, totalMinor }
  })

  await audit({
    action: "payout.build",
    resourceType: "payoutBatch",
    resourceId: result.batch.id,
    academyId: input.academyId,
    userId: input.actorUserId,
    metadata: {
      payoutGroup: input.payoutGroup,
      currency,
      legCount: result.attached,
      totalMinor: result.totalMinor,
      periodStart: input.periodStart.toISOString(),
      periodEnd: input.periodEnd.toISOString(),
    },
  })

  return result
}

export type StatusTransition =
  | { to: "APPROVED"; actorUserId: string }
  | { to: "PAID"; actorUserId: string; processorRef?: string }
  | { to: "CANCELLED"; actorUserId: string; reason?: string }

const ALLOWED: Record<string, Array<StatusTransition["to"]>> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["PAID", "CANCELLED"],
  PAID: [],
  CANCELLED: [],
}

/**
 * Progress a batch through DRAFT → APPROVED → PAID. Cancelling from DRAFT
 * or APPROVED releases the attached legs so they can be re-batched later.
 */
export async function updatePayoutStatus(
  batchId: string,
  tr: StatusTransition
): Promise<PayoutBatch> {
  const updated = await prisma.$transaction(async (tx) => {
    const batch = await tx.payoutBatch.findUnique({ where: { id: batchId } })
    if (!batch) throw new Error("Batch not found")
    if (!ALLOWED[batch.status]?.includes(tr.to)) {
      throw new Error(`Invalid transition: ${batch.status} → ${tr.to}`)
    }

    const patch: Prisma.PayoutBatchUpdateInput = { status: tr.to }
    if (tr.to === "APPROVED") patch.approvedAt = new Date()
    if (tr.to === "PAID") {
      patch.paidAt = new Date()
      if (tr.processorRef) patch.processorRef = tr.processorRef
    }
    if (tr.to === "CANCELLED") {
      await tx.ledgerEntry.updateMany({
        where: { payoutBatchId: batchId },
        data: { payoutBatchId: null },
      })
    }

    return tx.payoutBatch.update({ where: { id: batchId }, data: patch })
  })

  await audit({
    action: `payout.${tr.to.toLowerCase()}`,
    resourceType: "payoutBatch",
    resourceId: batchId,
    academyId: updated.academyId,
    userId: tr.actorUserId,
    metadata:
      tr.to === "PAID"
        ? { processorRef: tr.processorRef ?? null }
        : tr.to === "CANCELLED"
        ? { reason: tr.reason ?? null }
        : {},
  })

  return updated
}

export async function listPayoutBatches(
  academyId: string,
  filter?: { payoutGroup?: PayoutGroup; status?: PayoutBatch["status"] }
) {
  return prisma.payoutBatch.findMany({
    where: {
      academyId,
      ...(filter?.payoutGroup ? { payoutGroup: filter.payoutGroup } : {}),
      ...(filter?.status ? { status: filter.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  })
}

/**
 * Currently-payable pool per (group, currency) for an academy — i.e. legs
 * that exist, are not yet attached to a batch, and belong to a share group.
 * Used on the payouts page to show "what would be paid if I batched now".
 */
export async function unbatchedPoolByGroup(academyId: string) {
  const rows = await prisma.ledgerEntry.groupBy({
    by: ["payoutGroup", "currency"],
    where: {
      academyId,
      payoutBatchId: null,
      payoutGroup: { not: null },
    },
    _sum: { amountMinor: true },
    _count: { _all: true },
  })
  return rows.map((r) => ({
    payoutGroup: r.payoutGroup as PayoutGroup,
    currency: r.currency,
    amountMinor: -(r._sum.amountMinor ?? 0),
    legCount: r._count._all,
  }))
}
