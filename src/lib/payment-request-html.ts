import type { PayoutBatch, PayoutGroup } from "@prisma/client"

/**
 * Spec §4 walkthrough step 7 — "Customise form to raise payment and update
 * status for tracking." Renders a printable Payment Request document for
 * an Academy Admin to instruct payment to the payout group's beneficiaries.
 *
 * Inputs are deliberately minimal — name, totals, and the per-beneficiary
 * lines; layout is plain HTML so it can be emailed, printed, or fed to a
 * PDF renderer without bringing in a templating engine.
 */

export type PaymentRequestLine = {
  beneficiaryUserId: string | null
  beneficiaryName: string | null
  beneficiaryEmail: string | null
  amountMinor: number
  legCount: number
  promoCodeIds?: string[]
}

export type PaymentRequestInput = {
  batch: Pick<
    PayoutBatch,
    | "id"
    | "payoutGroup"
    | "periodStart"
    | "periodEnd"
    | "status"
    | "totalMinor"
    | "currency"
    | "processorRef"
    | "notes"
    | "createdAt"
  >
  academy: {
    name: string
    taxRegistrationNumber?: string | null
    taxJurisdiction?: string | null
  }
  lines: PaymentRequestLine[]
  /** Reference number printed on the document — typically batch id. */
  reference: string
}

const groupLabel: Record<PayoutGroup, string> = {
  ACADEMY: "Academy share",
  DEVELOPER: "Course Developer / Partner",
  MARKETER: "Marketer commission",
  PLATFORM_SUPPORT: "Platform Support fee",
}

function fmt(minor: number, currency: string) {
  return `${currency} ${(minor / 100).toFixed(2)}`
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

function escape(s: string | null | undefined) {
  if (s == null) return ""
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function renderPaymentRequestHtml(input: PaymentRequestInput): string {
  const { batch, academy, lines, reference } = input
  const total = fmt(batch.totalMinor, batch.currency)

  const linesHtml = lines.length
    ? lines
        .map(
          (l) => `
        <tr>
          <td>${escape(l.beneficiaryName ?? l.beneficiaryUserId ?? "Aggregated")}</td>
          <td>${escape(l.beneficiaryEmail ?? "—")}</td>
          <td style="text-align:right">${l.legCount.toLocaleString()}</td>
          <td style="text-align:right">${fmt(l.amountMinor, batch.currency)}</td>
        </tr>`
        )
        .join("")
    : `<tr><td colspan="4" style="text-align:center; color:#666">No beneficiary lines.</td></tr>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment Request ${escape(reference)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; max-width: 760px; margin: 32px auto; padding: 0 24px; font-size: 14px; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #f4f4f5; color: #333; border: 1px solid #e4e4e7; margin-left: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e4e4e7; }
    th { background: #fafafa; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .summary { margin-top: 20px; padding: 16px; background: #fafafa; border: 1px solid #e4e4e7; border-radius: 6px; }
    .summary-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .summary-row.total { font-weight: 700; border-top: 1px solid #d4d4d8; margin-top: 6px; padding-top: 8px; }
    .footer { margin-top: 32px; color: #777; font-size: 12px; }
    .sig-block { margin-top: 48px; display: flex; gap: 48px; }
    .sig { flex: 1; }
    .sig-line { border-top: 1px solid #999; margin-top: 48px; padding-top: 4px; font-size: 12px; color: #555; }
  </style>
</head>
<body>
  <h1>Payment Request <span class="badge">${escape(batch.status)}</span></h1>
  <div class="meta">
    Reference: <strong>${escape(reference)}</strong> ·
    Issued: ${fmtDate(batch.createdAt)} ·
    Period: ${fmtDate(batch.periodStart)} → ${fmtDate(batch.periodEnd)}
  </div>

  <h2 style="font-size:16px; margin-bottom:4px;">${escape(academy.name)}</h2>
  ${
    academy.taxRegistrationNumber
      ? `<div class="meta">Tax registration: ${escape(academy.taxRegistrationNumber)}${
          academy.taxJurisdiction ? ` (${escape(academy.taxJurisdiction)})` : ""
        }</div>`
      : ""
  }

  <h3 style="font-size:14px; margin-top:24px;">${groupLabel[batch.payoutGroup]} payout</h3>

  <table>
    <thead>
      <tr>
        <th>Beneficiary</th>
        <th>Email</th>
        <th style="text-align:right">Legs</th>
        <th style="text-align:right">Amount (${escape(batch.currency)})</th>
      </tr>
    </thead>
    <tbody>${linesHtml}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><span>Group</span><span>${groupLabel[batch.payoutGroup]}</span></div>
    <div class="summary-row"><span>Currency</span><span>${escape(batch.currency)}</span></div>
    <div class="summary-row"><span>Beneficiaries</span><span>${lines.length}</span></div>
    ${batch.processorRef ? `<div class="summary-row"><span>Processor reference</span><span>${escape(batch.processorRef)}</span></div>` : ""}
    <div class="summary-row total"><span>Total payable</span><span>${total}</span></div>
  </div>

  ${batch.notes ? `<div class="footer"><strong>Notes:</strong> ${escape(batch.notes)}</div>` : ""}

  <div class="sig-block">
    <div class="sig">
      <div class="sig-line">Authorised by (Academy Admin)</div>
    </div>
    <div class="sig">
      <div class="sig-line">Approved by (Finance)</div>
    </div>
  </div>

  <div class="footer">
    Generated by IESA LMS — Payment Request document. The amounts above are derived
    from the immutable ledger (spec §16); any discrepancy must be reconciled by
    investigating the underlying ledger entries, not by amending this request.
  </div>
</body>
</html>`
}
