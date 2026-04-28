import type { Metadata } from "next"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Download, FileText, Receipt } from "lucide-react"
import { formatPrice } from "@/lib/stripe"

export const metadata: Metadata = {
  title: "Invoices & Receipts",
  description: "Your full purchase history and downloadable receipts",
}

// Spec §5.2 — learners can view all historical records indefinitely.
// No date cutoff is applied. Both COMPLETED and REFUNDED purchases are
// shown so refunds remain visible as part of the historical record.
async function getPurchaseHistory(userId: string) {
  const [purchases, formalInvoices] = await Promise.all([
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
        course: { select: { title: true, slug: true } },
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      select: { id: true, purchaseId: true, invoiceNumber: true },
    }),
  ])

  const invoiceByPurchaseId = new Map(
    formalInvoices
      .filter((inv) => inv.purchaseId)
      .map((inv) => [inv.purchaseId!, inv])
  )

  return purchases.map((p) => {
    const formal = invoiceByPurchaseId.get(p.id)
    return {
      id: p.id,
      // Prefer the formal Phase-4 invoice number when one was generated.
      // Otherwise derive a stable fallback from the purchase id.
      invoiceNumber:
        formal?.invoiceNumber ?? `INV-${p.id.slice(0, 8).toUpperCase()}`,
      // Download URL works against either Invoice.id or Purchase.id —
      // the /api/invoices/[id] handler resolves both.
      downloadId: formal?.id ?? p.id,
      courseTitle: p.course?.title ?? p.courseName,
      // Purchase.amount is stored in minor units (cents).
      amount: Number(p.amount) / 100,
      status: p.status,
      createdAt: p.createdAt,
    }
  })
}

export default async function LearnerInvoicesPage() {
  const session = await auth()
  if (!session?.user) return null

  const records = await getPurchaseHistory(session.user.id)

  return (
    <div className="container py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Invoices &amp; Receipts</h1>
        <p className="text-muted-foreground mt-1">
          Your full purchase history is kept indefinitely. Re-download any
          receipt at any time.
        </p>
      </div>

      {records.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-lg mb-2">
              No invoices yet
            </h3>
            <p className="text-muted-foreground mb-4">
              Purchases will appear here as soon as you enrol in a paid course.
              Records are kept indefinitely.
            </p>
            <Button asChild>
              <Link href="/courses">Browse courses</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {records.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center shrink-0">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{r.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {r.courseTitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-semibold">{formatPrice(r.amount)}</p>
                      {r.status === "REFUNDED" ? (
                        <Badge
                          variant="outline"
                          className="text-xs border-amber-300 text-amber-800 bg-amber-50 dark:bg-amber-950 dark:text-amber-300"
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
                      <Link
                        href={`/api/invoices/${r.downloadId}`}
                        target="_blank"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
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
