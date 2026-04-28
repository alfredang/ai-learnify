import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { ShieldCheck } from "lucide-react"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How we collect, use, and protect your personal data",
}

const DEFAULT_POLICY = `
<h2>Privacy Policy</h2>

<h3>1. Information We Collect</h3>
<p>When you register, we collect your <strong>name, email address</strong>, and optionally an <strong>ID number</strong> for certificate issuance. Payment details are processed securely by Stripe and never stored on our servers.</p>

<h3>2. How We Use Your Data</h3>
<ul>
  <li><strong>Account management</strong> — authenticating you and personalising your dashboard</li>
  <li><strong>Learning records</strong> — tracking course progress, quiz scores, and certificate eligibility</li>
  <li><strong>Invoicing</strong> — generating invoices and receipts for your purchases</li>
  <li><strong>Communication</strong> — sending transactional emails (invoices, certificates, access reminders)</li>
</ul>

<h3>3. Data Retention</h3>
<p>Learner records are retained <strong>permanently</strong> (soft-delete only, per our platform specification). You may request a full JSON export of your data at any time from your Profile &gt; Privacy &amp; Data page.</p>

<h3>4. Data Sharing</h3>
<p>We do <strong>not</strong> sell your data. Data is shared only with:</p>
<ul>
  <li><strong>Payment processor</strong> (Stripe) — for payment processing</li>
  <li><strong>Email provider</strong> (Resend) — for transactional emails</li>
  <li><strong>Cloud infrastructure</strong> (Neon, Cloudinary) — for database hosting and media storage</li>
</ul>

<h3>5. Your Rights</h3>
<p>You have the right to:</p>
<ul>
  <li><strong>Access</strong> — download a full export of your personal data</li>
  <li><strong>Rectification</strong> — update your name, email, or certificate name via your profile</li>
  <li><strong>Deactivation</strong> — request account deactivation (records preserved per regulatory requirements)</li>
  <li><strong>Portability</strong> — receive your data in JSON format</li>
</ul>

<h3>6. Cookies</h3>
<p>We use essential cookies for authentication (session token) and language/currency preferences. No tracking or advertising cookies are used.</p>

<h3>7. Security</h3>
<p>All data is transmitted over HTTPS. Passwords are hashed with bcrypt. Login attempts are rate-limited (10 per minute).</p>

<h3>8. GDPR & PDPA Compliance</h3>
<p>This platform is designed to comply with the EU General Data Protection Regulation (GDPR) and Singapore Personal Data Protection Act (PDPA). For data protection enquiries, contact the Academy Admin.</p>

<h3>9. Changes to This Policy</h3>
<p>We may update this policy periodically. The version displayed on this page is the current and binding version.</p>
`

async function getPrivacyPolicy() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, privacyPolicyHtml: true },
  })
  return {
    academyName: academy?.name ?? "IES Digital Academy",
    html: academy?.privacyPolicyHtml || DEFAULT_POLICY,
  }
}

export default async function PrivacyPolicyPage() {
  const { academyName, html } = await getPrivacyPolicy()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <ShieldCheck className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Privacy Policy</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — How we handle your personal data
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
