import type { Invoice } from "@prisma/client"

export type InvoiceRenderData = Invoice & {
  academy: { name: string; primaryCurrency: string; taxJurisdiction: string | null }
  productName: string
  breakdown: {
    marketerMinor?: number
    platformSupportMinor?: number
    academyMinor?: number
    developerMinor?: number
  } | null
}

function formatMoney(minor: number, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  })
  return formatter.format(minor / 100)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/**
 * Spec §10.2 / §18 Tax & Finance: jurisdiction-aware downloadable invoice.
 * HTML + print-to-PDF flow matches how certificates already work.
 */
export function renderInvoiceHtml(data: InvoiceRenderData): string {
  const cur = data.currency
  const issued = new Date(data.issuedAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Inter, sans-serif; color: #1a202c; background: #f7fafc; padding: 32px; }
    .invoice { max-width: 800px; margin: 0 auto; background: white; padding: 48px; border: 1px solid #e2e8f0; }
    .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; }
    .academy-name { font-size: 24px; font-weight: 700; }
    .tax-jurisdiction { font-size: 12px; color: #718096; margin-top: 4px; }
    .meta { text-align: right; }
    .meta-label { font-size: 11px; color: #718096; text-transform: uppercase; letter-spacing: 1px; }
    .meta-value { font-size: 14px; font-weight: 500; margin-bottom: 10px; }
    .invoice-title { font-size: 32px; font-weight: 700; margin-bottom: 8px; color: #2d3748; }
    .recipient { background: #f7fafc; padding: 16px 20px; border-radius: 6px; margin-bottom: 32px; }
    .recipient-label { font-size: 10px; color: #718096; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
    .recipient-name { font-size: 15px; font-weight: 600; }
    .recipient-email { font-size: 13px; color: #4a5568; }
    table.lines { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    table.lines th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #718096; padding: 10px 12px; border-bottom: 2px solid #e2e8f0; }
    table.lines td { padding: 14px 12px; border-bottom: 1px solid #edf2f7; font-size: 14px; }
    table.lines td:last-child, table.lines th:last-child { text-align: right; }
    .totals { margin-left: auto; width: 280px; padding: 12px 0; border-top: 2px solid #2d3748; }
    .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals-row.grand { font-size: 18px; font-weight: 700; border-top: 1px solid #e2e8f0; padding-top: 10px; margin-top: 6px; }
    .totals-row .label { color: #4a5568; }
    .totals-row .value { font-variant-numeric: tabular-nums; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 11px; color: #718096; text-align: center; }
    .print-btn { display: block; margin: 0 auto 20px; padding: 12px 28px; background: #2d3748; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 500; }
    @media print { body { background: white; padding: 0; } .invoice { border: none; } .print-btn { display: none; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Download as PDF</button>

  <div class="invoice">
    <div class="header">
      <div>
        <div class="academy-name">${escapeHtml(data.academy.name)}</div>
        ${data.academy.taxJurisdiction ? `<div class="tax-jurisdiction">Tax Jurisdiction: ${escapeHtml(data.academy.taxJurisdiction)}</div>` : ""}
      </div>
      <div class="meta">
        <div class="invoice-title">Invoice</div>
        <div class="meta-label">Invoice Number</div>
        <div class="meta-value">${escapeHtml(data.invoiceNumber)}</div>
        <div class="meta-label">Date</div>
        <div class="meta-value">${issued}</div>
      </div>
    </div>

    <div class="recipient">
      <div class="recipient-label">Billed to</div>
      <div class="recipient-name">${escapeHtml(data.recipientName ?? "—")}</div>
      ${data.recipientEmail ? `<div class="recipient-email">${escapeHtml(data.recipientEmail)}</div>` : ""}
    </div>

    <table class="lines">
      <thead>
        <tr>
          <th>Description</th>
          <th>Type</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${escapeHtml(data.productName)}</td>
          <td>${data.productType === "PROGRAMME" ? "Programme" : "Course"}</td>
          <td>${formatMoney(data.grossMinor, cur)}</td>
        </tr>
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-row">
        <span class="label">Subtotal</span>
        <span class="value">${formatMoney(data.grossMinor, cur)}</span>
      </div>
      ${data.discountMinor > 0 ? `
      <div class="totals-row">
        <span class="label">Discount</span>
        <span class="value">− ${formatMoney(data.discountMinor, cur)}</span>
      </div>` : ""}
      ${data.taxMinor > 0 ? `
      <div class="totals-row">
        <span class="label">Tax${data.taxJurisdiction ? ` (${escapeHtml(data.taxJurisdiction)})` : ""}</span>
        <span class="value">${formatMoney(data.taxMinor, cur)}</span>
      </div>` : ""}
      <div class="totals-row grand">
        <span class="label">Total paid</span>
        <span class="value">${formatMoney(data.netMinor, cur)}</span>
      </div>
    </div>

    <div class="footer">
      ${escapeHtml(data.academy.name)} &middot; Invoice ${escapeHtml(data.invoiceNumber)} &middot; Generated ${issued}
    </div>
  </div>
</body>
</html>`
}
