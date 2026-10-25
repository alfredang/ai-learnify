import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Mail, Phone, MapPin, MessageCircle } from "lucide-react"

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Academy team",
}

const DEFAULT_CONTACT = `
<h2>Get in touch</h2>

<p>We're here to help with anything related to your account, courses, certificates, or invoices. The fastest way to reach us is by email — we typically reply within one business day.</p>

<h3>What to include in your message</h3>
<ul>
  <li>Your registered email address</li>
  <li>The course or invoice number (if applicable)</li>
  <li>A clear description of the issue, including any error messages or screenshots</li>
</ul>

<h3>Looking for something specific?</h3>
<ul>
  <li>Need help with login, certificates, or access? Visit the <a href="/help">Help Center</a>.</li>
  <li>Quick questions? Check the <a href="/faq">FAQ</a> first.</li>
  <li>Refunds and billing? See the <a href="/refund-policy">Refund Policy</a>.</li>
</ul>

<p>For partnership, content licensing, or affiliate enquiries, please mention <em>"partnership"</em> in your subject line.</p>
`

const DEFAULT_EMAIL = "support@iesdigitalacademy.com"
const DEFAULT_PHONE = ""
const DEFAULT_ADDRESS = ""

async function getContact() {
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: {
      name: true,
      contactHtml: true,
      contactEmail: true,
      contactPhone: true,
      contactAddress: true,
    },
  })
  return {
    academyName: academy?.name ?? "Learnify",
    html: academy?.contactHtml || DEFAULT_CONTACT,
    email: academy?.contactEmail || DEFAULT_EMAIL,
    phone: academy?.contactPhone || DEFAULT_PHONE,
    address: academy?.contactAddress || DEFAULT_ADDRESS,
  }
}

export default async function ContactPage() {
  const { academyName, html, email, phone, address } = await getContact()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <MessageCircle className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Contact</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {academyName} — we&apos;d love to hear from you
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <Mail className="h-5 w-5 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Email</div>
              <a
                href={`mailto:${email}`}
                className="text-sm font-medium text-primary hover:underline break-all"
              >
                {email}
              </a>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <Phone className="h-5 w-5 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Phone</div>
              <div className="text-sm font-medium">
                {phone || <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-start gap-3">
            <MapPin className="h-5 w-5 text-primary mt-0.5" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Address</div>
              <div className="text-sm font-medium whitespace-pre-line">
                {address || <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          </CardContent>
        </Card>
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
