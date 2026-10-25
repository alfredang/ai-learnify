import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { FileText } from "lucide-react"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms and conditions for using our platform",
}

const DEFAULT_TERMS = `
<h2>Terms of Service</h2>

<h3>1. Acceptance of Terms</h3>
<p>By accessing or using Learnify, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.</p>

<h3>2. Account Registration</h3>
<ul>
  <li>You must provide accurate and complete information during registration.</li>
  <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
  <li>One account per person. Sharing accounts is prohibited.</li>
</ul>

<h3>3. Course Access</h3>
<ul>
  <li>Paid courses grant a <strong>90-day access window</strong> from the date of purchase.</li>
  <li>Complimentary programmes have no expiry.</li>
  <li>Access is for personal, non-commercial use only.</li>
  <li>You may not record, redistribute, or resell course content.</li>
</ul>

<h3>4. Payments & Refunds</h3>
<ul>
  <li>All prices are displayed in the selected display currency but charged in the course's set currency.</li>
  <li>Payments are processed securely via Stripe.</li>
  <li>All purchases are <strong>non-refundable by default</strong>. See our <a href="/refund-policy">Refund Policy</a> for exceptions.</li>
</ul>

<h3>5. Certificates</h3>
<ul>
  <li>Certificates are issued automatically upon meeting completion criteria (content completion, assessment pass, and survey).</li>
  <li>Certificates include a QR code for public verification.</li>
  <li>The name on your certificate is exactly as entered in your profile — verify it before completion.</li>
</ul>

<h3>6. Intellectual Property</h3>
<p>All course content, materials, and platform software are protected by copyright. Course developers retain ownership of their content; the platform holds a licence to distribute it.</p>

<h3>7. Prohibited Conduct</h3>
<ul>
  <li>Attempting to access courses without proper enrolment</li>
  <li>Circumventing access controls or security measures</li>
  <li>Submitting fraudulent payment information</li>
  <li>Harassing other users or course developers</li>
</ul>

<h3>8. Account Deactivation</h3>
<p>You may request account deactivation at any time. Per our data retention policy, records are soft-deleted and preserved for regulatory compliance.</p>

<h3>9. Limitation of Liability</h3>
<p>The platform is provided "as is". We are not liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>

<h3>10. Changes to Terms</h3>
<p>We may update these terms periodically. Continued use of the platform after changes constitutes acceptance of the updated terms.</p>
`

async function getTerms() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, termsHtml: true },
  })
  return {
    academyName: academy?.name ?? "Learnify",
    html: academy?.termsHtml || DEFAULT_TERMS,
  }
}

export default async function TermsPage() {
  const { academyName, html } = await getTerms()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <FileText className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Terms of Service</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — Terms and conditions
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
