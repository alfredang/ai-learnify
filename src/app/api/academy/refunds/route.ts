import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reverseLedger } from "@/lib/ledger"
import { getStripe } from "@/lib/stripe"
import { audit, getRequestIp } from "@/lib/audit"

const schema = z.object({
  parentTxnId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  skipStripe: z.boolean().optional(),
})

/**
 * Spec §14: manual admin-only refund. Writes ledger reversal entries, revokes
 * the corresponding AccessGrant, and attempts to refund the Stripe payment
 * intent (skippable for tests / legacy txns that were never charged).
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const { parentTxnId, reason, skipStripe } = parsed.data

  // Authz: fetch the CHARGE leg to find the academy and verify the caller
  // is Academy Admin for that tenant (or Platform Owner).
  const chargeLeg = await prisma.ledgerEntry.findFirst({
    where: { parentTxnId, entryType: "CHARGE" },
    select: {
      id: true,
      academyId: true,
      userId: true,
      productType: true,
      productId: true,
      metadata: true,
    },
  })
  if (!chargeLeg) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 })
  }

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdminForAcademy = session.user.memberships?.some(
    (m) => m.academyId === chargeLeg.academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isAdminForAcademy) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // 1. Write reversal entries (throws if already reversed).
  let reversalEntries
  try {
    reversalEntries = await reverseLedger(parentTxnId)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Reverse failed" },
      { status: 409 }
    )
  }

  // 2. Revoke the AccessGrant for the refunded product.
  if (chargeLeg.userId) {
    const grant = await prisma.accessGrant.findFirst({
      where: {
        userId: chargeLeg.userId,
        ...(chargeLeg.productType === "COURSE"
          ? { courseId: chargeLeg.productId }
          : { programmeId: chargeLeg.productId }),
        isActive: true,
      },
    })
    if (grant) {
      await prisma.accessGrant.update({
        where: { id: grant.id },
        data: {
          isActive: false,
          revokedAt: new Date(),
          revokedReason: reason ?? "refund",
        },
      })
    }
  }

  // 3. Stripe refund via payment intent id (stored in the CHARGE leg metadata).
  const md = (chargeLeg.metadata as { stripePaymentIntentId?: string } | null) ?? null
  const pi = md?.stripePaymentIntentId
  let stripeRefundId: string | null = null
  if (pi && !skipStripe) {
    try {
      const refund = await getStripe().refunds.create({ payment_intent: pi })
      stripeRefundId = refund.id
    } catch (err) {
      console.error("[refund] stripe refund failed", err)
      // Don't abort — ledger reversal already persisted. Admin can retry
      // the Stripe side manually.
    }
  }

  await audit({
    action: "refund.issue",
    resourceType: "ledger",
    resourceId: parentTxnId,
    userId: session.user.id,
    academyId: chargeLeg.academyId,
    metadata: {
      reason: reason ?? null,
      reversedEntries: reversalEntries.length,
      stripeRefundId,
      stripeAttempted: Boolean(pi && !skipStripe),
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({
    parentTxnId,
    reversalCount: reversalEntries.length,
    stripeRefundId,
  })
}
