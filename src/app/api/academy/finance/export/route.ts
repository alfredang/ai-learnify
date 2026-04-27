import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

/**
 * Spec §16 — exportable & auditable ledger; Academy Admin Step 6 —
 * export customisable ledger records for periodic reporting, payment
 * to respective stakeholders, and audit.
 *
 * GET /api/academy/finance/export?academyId=...&from=...&to=...&group=...
 *
 * Returns CSV. Columns follow the immutable ledger columns per spec §16
 * plus convenience fields (date, invoice number) so an admin can open
 * the file directly in spreadsheet tooling.
 */

function csvEscape(s: unknown): string {
  if (s === null || s === undefined) return ""
  const str = String(s)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function minorToDecimal(minor: number): string {
  // 2 decimal places, signed. Safe for any currency we support; JPY et al.
  // would need per-currency precision, deferred.
  return (minor / 100).toFixed(2)
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const academyId = url.searchParams.get("academyId")
  if (!academyId) {
    return NextResponse.json({ error: "academyId required" }, { status: 400 })
  }

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isAdmin = session.user.memberships?.some(
    (m) => m.academyId === academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const group = url.searchParams.get("group") // optional PayoutGroup filter
  const entryType = url.searchParams.get("entryType") // optional LedgerEntryType

  const dateFilter: { gte?: Date; lte?: Date } = {}
  if (from) {
    const d = new Date(from)
    if (!isNaN(+d)) dateFilter.gte = d
  }
  if (to) {
    const d = new Date(to)
    if (!isNaN(+d)) dateFilter.lte = d
  }

  const rows = await prisma.ledgerEntry.findMany({
    where: {
      academyId,
      ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}),
      ...(group ? { payoutGroup: group as never } : {}),
      ...(entryType ? { entryType: entryType as never } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 50_000,
    select: {
      createdAt: true,
      parentTxnId: true,
      productType: true,
      productId: true,
      userId: true,
      beneficiaryUserId: true,
      entryType: true,
      amountMinor: true,
      currency: true,
      payoutGroup: true,
      payoutBatchId: true,
      reversalOfId: true,
      notes: true,
    },
  })

  const header = [
    "created_at",
    "parent_txn_id",
    "product_type",
    "product_id",
    "learner_user_id",
    "beneficiary_user_id",
    "entry_type",
    "amount_minor",
    "amount",
    "currency",
    "payout_group",
    "payout_batch_id",
    "reversal_of_id",
    "notes",
  ]

  const lines: string[] = [header.join(",")]
  for (const r of rows) {
    lines.push(
      [
        r.createdAt.toISOString(),
        r.parentTxnId,
        r.productType,
        r.productId,
        r.userId ?? "",
        r.beneficiaryUserId ?? "",
        r.entryType,
        r.amountMinor,
        minorToDecimal(r.amountMinor),
        r.currency,
        r.payoutGroup ?? "",
        r.payoutBatchId ?? "",
        r.reversalOfId ?? "",
        r.notes ?? "",
      ]
        .map(csvEscape)
        .join(",")
    )
  }

  await audit({
    action: "ledger.export",
    resourceType: "ledger",
    academyId,
    userId: session.user.id,
    metadata: {
      rows: rows.length,
      from: dateFilter.gte?.toISOString() ?? null,
      to: dateFilter.lte?.toISOString() ?? null,
      group,
      entryType,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  const filename = `ledger-${academyId.slice(-8)}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
