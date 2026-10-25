import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldCheck } from "lucide-react"

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Our refund and cancellation policy",
}

const DEFAULT_POLICY = `
<h2>Refund & Cancellation Policy</h2>

<h3>1. Non-Refundable by Default</h3>
<p>All purchases on Learnify — including E-Courses and Programmes — are <strong>non-refundable</strong> once payment is completed and access has been granted. By completing a purchase, you acknowledge and agree to this policy.</p>

<h3>2. Why We Are Non-Refundable</h3>
<p>Our digital learning products grant immediate access to course content upon purchase. Because the content is consumed digitally and cannot be "returned," we are unable to offer routine refunds.</p>

<h3>3. Exceptional Circumstances</h3>
<p>In rare and exceptional cases, the Academy Admin may consider a manual refund at their sole discretion. Examples include:</p>
<ul>
  <li>Duplicate charges due to a technical error</li>
  <li>Access not granted after confirmed payment</li>
  <li>Significant course content discrepancy (course delivered is materially different from what was advertised)</li>
</ul>

<h3>4. How to Request a Refund</h3>
<p>If you believe you qualify for an exceptional refund, please contact the Academy Admin within <strong>7 days</strong> of purchase with:</p>
<ul>
  <li>Your invoice number</li>
  <li>A description of the issue</li>
  <li>Any supporting evidence (screenshots, etc.)</li>
</ul>

<h3>5. Refund Processing</h3>
<p>Approved refunds are processed as ledger reversals. The refund amount will be returned to the original payment method within 5–10 business days. A refund receipt will be emailed and appear in your Invoices & Receipts page.</p>

<h3>6. Free / Complimentary Content</h3>
<p>Complimentary programmes and free courses have no payment associated and therefore no refund applies.</p>

<h3>7. Policy Changes</h3>
<p>This policy may be updated from time to time. The version displayed on this page is the current and binding version.</p>
`

async function getRefundPolicy() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, refundPolicyHtml: true },
  })
  return {
    academyName: academy?.name ?? "Learnify",
    html: academy?.refundPolicyHtml || DEFAULT_POLICY,
  }
}

export default async function RefundPolicyPage() {
  const { academyName, html } = await getRefundPolicy()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <ShieldCheck className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Refund Policy</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — Refund & Cancellation Policy
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div
            className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
