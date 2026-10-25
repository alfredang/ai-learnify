import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { HelpCircle, ChevronDown } from "lucide-react"

export const metadata: Metadata = {
  title: "FAQ",
  description: "Frequently asked questions",
}

type FaqItem = { q: string; a: string }

const DEFAULT_FAQ: FaqItem[] = [
  {
    q: "How long do I have access to a course I purchase?",
    a: "Paid E-Courses and Programmes grant a <strong>90-day access window</strong> from the date of purchase. Complimentary content has no expiry.",
  },
  {
    q: "Are there live classes or scheduled sessions?",
    a: "No. Learnify is <strong>self-paced and asynchronous only</strong>. You learn whenever and wherever you choose, within your access window.",
  },
  {
    q: "How do I earn a certificate?",
    a: "Certificates are issued automatically once you complete at least <strong>50% of the content</strong>, pass the final assessment with <strong>80% or higher</strong>, and submit the post-course survey — all before your access expires.",
  },
  {
    q: "Can I verify a certificate someone else earned?",
    a: "Yes. Every certificate carries a QR code linking to a public verification page at <code>/verify/[id]</code>. Anyone can scan or open the link to confirm authenticity.",
  },
  {
    q: "Are refunds available?",
    a: "All purchases are <strong>non-refundable by default</strong>. Exceptional cases (duplicate charges, access not granted, material content discrepancy) may be reviewed by the Academy Admin within 7 days of purchase. See the <a href=\"/refund-policy\">Refund Policy</a>.",
  },
  {
    q: "What's the difference between an E-Course and a Programme?",
    a: "An <strong>E-Course</strong> is a single self-contained course. A <strong>Programme</strong> bundles multiple courses with a shared certificate at the end. Both follow the same 90-day access rule when paid.",
  },
  {
    q: "Can I share my account with someone else?",
    a: "No. Accounts are personal and non-transferable. Sharing accounts violates our <a href=\"/terms\">Terms of Service</a> and may result in deactivation.",
  },
  {
    q: "How do I become a Course Developer?",
    a: "Visit the <a href=\"/become-instructor\">Become a Course Developer</a> page. New users sign up directly as a Developer; existing learners can upgrade their role with one click.",
  },
  {
    q: "What happens to my learning records if I deactivate my account?",
    a: "Records are <strong>soft-deleted only</strong> — preserved for regulatory compliance and never destroyed. You can request a JSON export of your data at any time.",
  },
  {
    q: "Which currencies and languages do you support?",
    a: "Display currency and tax are jurisdiction-aware. Available languages and currencies are configured per-academy by the Academy Admin.",
  },
]

async function getFaq() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, faqJson: true },
  })
  const items =
    Array.isArray(academy?.faqJson) && (academy?.faqJson as FaqItem[]).length > 0
      ? (academy?.faqJson as FaqItem[])
      : DEFAULT_FAQ
  return {
    academyName: academy?.name ?? "Learnify",
    items,
  }
}

export default async function FaqPage() {
  const { academyName, items } = await getFaq()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <HelpCircle className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — quick answers to common questions
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-2 sm:p-4 divide-y">
          {items.map((item, idx) => (
            <details key={idx} className="group py-2">
              <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-3 py-2 rounded-md hover:bg-muted/50 text-sm font-medium">
                <span>{item.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div
                className="prose prose-sm prose-slate max-w-none px-3 pt-2 pb-3 prose-p:text-muted-foreground prose-a:text-primary"
                dangerouslySetInnerHTML={{ __html: item.a }}
              />
            </details>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
