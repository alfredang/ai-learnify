import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import {
  renderPaymentRequestHtml,
  type PaymentRequestLine,
} from "@/lib/payment-request-html"

/**
 * GET /api/academy/payouts/[id]/payment-request
 *
 * Spec §4 walkthrough step 7 — renders the payable Payment Request document
 * for a PayoutBatch. Returns HTML by default; pass `?format=json` to receive
 * the same data as a structured response (useful for the in-app preview).
 *
 * Aggregates ledger entries by beneficiary so the document shows one line
 * per payee even when many transactions contributed to the batch. Amounts
 * are absolute values — beneficiary legs are stored as negatives in the
 * ledger (so the parentTxnId sums to zero), but the payable amount we
 * print is the positive absolute owed to the beneficiary.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const url = new URL(request.url)
  const format = url.searchParams.get("format") ?? "html"

  const batch = await prisma.payoutBatch.findUnique({
    where: { id },
    include: {
      academy: {
        select: {
          name: true,
          taxRegistrationNumber: true,
          taxJurisdiction: true,
        },
      },
      entries: {
        select: {
          id: true,
          beneficiaryUserId: true,
          amountMinor: true,
          promoCodeId: true,
        },
      },
    },
  })
  if (!batch) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === batch.academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Aggregate by beneficiary. Platform-Support payouts have no per-user
  // beneficiary so they collapse into a single "Aggregated" line.
  const byBeneficiary = new Map<
    string,
    {
      beneficiaryUserId: string | null
      amountMinor: number
      legCount: number
      promoCodeIds: Set<string>
    }
  >()
  for (const e of batch.entries) {
    const key = e.beneficiaryUserId ?? "__platform__"
    const cur = byBeneficiary.get(key) ?? {
      beneficiaryUserId: e.beneficiaryUserId,
      amountMinor: 0,
      legCount: 0,
      promoCodeIds: new Set<string>(),
    }
    cur.amountMinor += Math.abs(e.amountMinor)
    cur.legCount += 1
    if (e.promoCodeId) cur.promoCodeIds.add(e.promoCodeId)
    byBeneficiary.set(key, cur)
  }

  const userIds = Array.from(byBeneficiary.values())
    .map((v) => v.beneficiaryUserId)
    .filter((v): v is string => !!v)
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : []
  const userMap = new Map(users.map((u) => [u.id, u]))

  const lines: PaymentRequestLine[] = Array.from(byBeneficiary.values()).map(
    (v) => {
      const user = v.beneficiaryUserId ? userMap.get(v.beneficiaryUserId) : null
      return {
        beneficiaryUserId: v.beneficiaryUserId,
        beneficiaryName: user?.name ?? null,
        beneficiaryEmail: user?.email ?? null,
        amountMinor: v.amountMinor,
        legCount: v.legCount,
        promoCodeIds: Array.from(v.promoCodeIds),
      }
    }
  )

  // Sort largest-first so the document leads with the biggest payee.
  lines.sort((a, b) => b.amountMinor - a.amountMinor)

  const reference = batch.id

  await audit({
    action: "payout.paymentRequest.generate",
    resourceType: "payoutBatch",
    resourceId: batch.id,
    userId: session.user.id,
    academyId: batch.academyId,
    metadata: {
      payoutGroup: batch.payoutGroup,
      totalMinor: batch.totalMinor,
      lineCount: lines.length,
      format,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  if (format === "json") {
    return NextResponse.json({
      reference,
      batch: {
        id: batch.id,
        payoutGroup: batch.payoutGroup,
        status: batch.status,
        periodStart: batch.periodStart,
        periodEnd: batch.periodEnd,
        totalMinor: batch.totalMinor,
        currency: batch.currency,
        notes: batch.notes,
        processorRef: batch.processorRef,
      },
      academy: batch.academy,
      lines,
    })
  }

  const html = renderPaymentRequestHtml({
    batch,
    academy: batch.academy,
    lines,
    reference,
  })

  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="payment-request-${batch.id}.html"`,
    },
  })
}
