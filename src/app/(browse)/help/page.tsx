import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { LifeBuoy, Mail, BookOpen, FileText } from "lucide-react"

export const metadata: Metadata = {
  title: "Help Center",
  description: "Get help with your account, courses, and certificates",
}

const DEFAULT_HELP = `
<h2>How can we help?</h2>

<p>This Help Center covers the most common questions about using IES Digital Academy. If you can't find what you need, contact your Academy Admin via the <a href="/contact">Contact page</a>.</p>

<h3>Account & Login</h3>
<ul>
  <li><strong>Forgot your password?</strong> Use <a href="/forgot-password">Forgot Password</a> on the login screen — a reset link will be emailed to you.</li>
  <li><strong>Email change.</strong> Go to <em>Profile &gt; Email</em> and submit your new address. A verification link is sent to confirm the change.</li>
  <li><strong>Login attempts are rate-limited</strong> at 10 per minute. If you're locked out briefly, wait a moment and try again.</li>
</ul>

<h3>Courses & Programmes</h3>
<ul>
  <li><strong>90-day access.</strong> Paid E-Courses and Programmes grant a 90-day access window from the date of purchase. After expiry, content is no longer accessible.</li>
  <li><strong>Complimentary content</strong> never expires and is free to anyone with an account.</li>
  <li><strong>Self-paced only.</strong> All learning is asynchronous — there are no live classes or scheduled sessions.</li>
</ul>

<h3>Certificates</h3>
<ul>
  <li>Certificates are issued automatically once you reach <strong>≥50% content completion</strong>, pass the assessment with <strong>≥80%</strong>, and complete the post-course survey, all before your access expires.</li>
  <li>Each certificate carries a QR code that links to a public verification page.</li>
  <li>The name printed on your certificate matches the <em>full name</em> on your profile — please verify it before you finish your course.</li>
</ul>

<h3>Payments & Invoices</h3>
<ul>
  <li>All payments are processed by Stripe. We never see or store your card details.</li>
  <li>Invoices are emailed automatically after each successful purchase and are also available under <em>Account &gt; Invoices &amp; Receipts</em>.</li>
  <li>For refund eligibility, see our <a href="/refund-policy">Refund Policy</a>.</li>
</ul>

<h3>Still need help?</h3>
<p>Send us a message via the <a href="/contact">Contact page</a> or browse the <a href="/faq">FAQ</a>.</p>
`

async function getContent() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, helpCenterHtml: true },
  })
  return {
    academyName: academy?.name ?? "IES Digital Academy",
    html: academy?.helpCenterHtml || DEFAULT_HELP,
  }
}

const quickLinks = [
  { icon: BookOpen, title: "Browse Courses", href: "/courses", desc: "Find your next course" },
  { icon: FileText, title: "FAQ", href: "/faq", desc: "Quick answers to common questions" },
  { icon: Mail, title: "Contact", href: "/contact", desc: "Reach the Academy team" },
]

export default async function HelpCenterPage() {
  const { academyName, html } = await getContent()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <LifeBuoy className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Help Center</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — guidance for learners and developers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {quickLinks.map((q) => (
          <Link key={q.href} href={q.href}>
            <Card className="hover:border-primary transition-colors h-full">
              <CardContent className="p-4 flex items-start gap-3">
                <q.icon className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="text-sm font-semibold">{q.title}</div>
                  <div className="text-xs text-muted-foreground">{q.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div
            className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
