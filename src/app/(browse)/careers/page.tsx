import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Briefcase, ArrowRight } from "lucide-react"

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the team building Learnify",
}

const DEFAULT_CAREERS = `
<h2>Build the future of self-paced learning</h2>

<p>Learnify is a small, focused team building an international, multi-tenant learning platform. We care about <strong>learner outcomes</strong>, transparent revenue sharing, and shipping quality software in small, well-tested increments.</p>

<h3>How we work</h3>
<ul>
  <li><strong>Async-first.</strong> Most of our work — including the product itself — is asynchronous. We default to writing things down so anyone can pick them up later.</li>
  <li><strong>Specs over guesses.</strong> Every feature traces back to a section of the product spec. If a feature can't be justified by the spec or by clear learner benefit, we don't ship it.</li>
  <li><strong>Small, reviewable changes.</strong> We prefer many small PRs over one giant one. CI runs on every push.</li>
  <li><strong>Outcomes over hours.</strong> Flexible schedules, generous time off, results-driven reviews.</li>
</ul>

<h3>Who we hire</h3>
<ul>
  <li><strong>Course Developers</strong> — subject-matter experts who can publish authoritative self-paced content. Apply via <a href="/become-instructor">Become a Course Developer</a>.</li>
  <li><strong>Engineers</strong> — full-stack TypeScript / Next.js / Postgres, with a bias for clean data models and minimal abstractions.</li>
  <li><strong>Designers</strong> — comfortable with shadcn/Radix component systems and instructional UX.</li>
  <li><strong>Customer & Academy Success</strong> — supporting Academy Admins as they onboard their organisations onto the platform.</li>
</ul>

<h3>Open roles</h3>
<p>We don't always have open roles listed publicly. If you're excited about what we're building and your background fits, send us your CV and a short note about which area you'd contribute to.</p>

<p>We review every application personally and aim to respond within two weeks.</p>
`

async function getCareers() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { name: true, careersHtml: true, contactEmail: true },
  })
  return {
    academyName: academy?.name ?? "Learnify",
    html: academy?.careersHtml || DEFAULT_CAREERS,
    email: academy?.contactEmail || "support@iesdigitalacademy.com",
  }
}

export default async function CareersPage() {
  const { academyName, html, email } = await getCareers()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Briefcase className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Careers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — join the team
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-6 sm:p-8">
          <div
            className="prose prose-slate max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Interested? Get in touch.</div>
            <div className="text-xs text-muted-foreground">
              Send your CV and a short note to {email} or use the contact form.
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/contact">
              Contact us <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
