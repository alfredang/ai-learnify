import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, Receipt, Layers, BookOpen } from "lucide-react"
import { formatPrice } from "@/lib/stripe"

export const metadata: Metadata = {
  title: "Invoices & Receipts",
  description: "Your full purchase history and downloadable receipts",
}

async function getInvoiceHistory(userId: string) {
  // Query the Phase 4 Invoice model directly — covers both courses and programmes.
  // Also pull legacy Purchase rows that don't have a formal Invoice yet.
  const [invoices, legacyPurchases] = await Promise.all([
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        invoiceNumber: true,
        productType: true,
        productId: true,
        grossMinor: true,
        discountMinor: true,
        netMinor: true,
        currency: true,
        issuedAt: true,
        purchaseId: true,
      },
    }),
    prisma.purchase.findMany({
      where: {
        userId,
        status: { in: ["COMPLETED", "REFUNDED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        status: true,
        createdAt: true,
        courseName: true,
        course: { select: { title: true } },
      },
    }),
  ])

  // Track which purchase IDs already have a formal invoice
  const invoicedPurchaseIds = new Set(
    invoices.filter((i) => i.purchaseId).map((i) => i.purchaseId!)
  )

  // Resolve product names for formal invoices
  const courseIds = invoices.filter((i) => i.productType === "COURSE").map((i) => i.productId)
  const programmeIds = invoices.filter((i) => i.productType === "PROGRAMME").map((i) => i.productId)

  const [courses, programmes] = await Promise.all([
    courseIds.length > 0
      ? prisma.course.findMany({
          where: { id: { in: courseIds } },
          select: { id: true, title: true },
        })
      : [],
    programmeIds.length > 0
      ? prisma.programme.findMany({
          where: { id: { in: programmeIds } },
          select: { id: true, title: true },
        })
      : [],
  ])

  const courseNames = new Map(courses.map((c) => [c.id, c.title]))
  const programmeNames = new Map(programmes.map((p) => [p.id, p.title]))

  // Build unified records — formal invoices first
  const records: {
    id: string
    invoiceNumber: string
    productName: string
    productType: "COURSE" | "PROGRAMME"
    amount: number
    status: "PAID" | "REFUNDED"
    date: Date
  }[] = []

  for (const inv of invoices) {
    const productName =
      inv.productType === "PROGRAMME"
        ? programmeNames.get(inv.productId) ?? "Programme"
        : courseNames.get(inv.productId) ?? "Course"

    records.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      productName,
      productType: inv.productType as "COURSE" | "PROGRAMME",
      amount: inv.netMinor / 100,
      status: "PAID",
      date: inv.issuedAt,
    })
  }

  // Add legacy purchases that don't have formal invoices
  for (const p of legacyPurchases) {
    if (invoicedPurchaseIds.has(p.id)) continue
    records.push({
      id: p.id,
      invoiceNumber: `INV-${p.id.slice(0, 8).toUpperCase()}`,
      productName: p.course?.title ?? p.courseName,
      productType: "COURSE",
      amount: Number(p.amount) / 100,
      status: p.status === "REFUNDED" ? "REFUNDED" : "PAID",
      date: p.createdAt,
    })
  }

  // Sort by date descending
  records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  return records
}

export default async function LearnerInvoicesPage() {
  const session = await auth()
  if (!session?.user) return null

  const records = await getInvoiceHistory(session.user.id)

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-start gap-4">
        <Receipt className="h-10 w-10 text-primary mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Invoices & Receipts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Auto-generated after every payment. Stored permanently. Download anytime.
          </p>
        </div>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold text-lg mb-2">No invoices yet</h3>
            <p className="text-muted-foreground text-sm mb-4">
              Invoices are auto-generated after successful payment. No pre-payment invoices.
            </p>
            <Button asChild>
              <Link href="/courses">Browse E-Courses</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Icon + details */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 bg-muted rounded-lg flex items-center justify-center shrink-0">
                      {r.productType === "PROGRAMME" ? (
                        <Layers className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <BookOpen className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{r.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {r.productName}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.date).toLocaleDateString()}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {r.productType === "PROGRAMME" ? "Programme" : "E-Course"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Amount + status + download */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                    <div className="text-left sm:text-right">
                      <p className="font-semibold">{formatPrice(r.amount)}</p>
                      {r.status === "REFUNDED" ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-amber-300 text-amber-800 bg-amber-50"
                        >
                          Refunded
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Paid
                        </Badge>
                      )}
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/api/invoices/${r.id}`} target="_blank">
                        <Download className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Download</span>
                      </Link>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
