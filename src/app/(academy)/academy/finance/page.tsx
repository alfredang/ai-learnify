import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DollarSign, TrendingUp, Receipt, RefreshCcw, ArrowRight, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

function formatMinor(minor: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export default async function AcademyFinancePage() {
  const session = await auth()
  if (!session?.user) return null
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  // Spec §16 ledger summary: sum by entryType for this academy.
  const byType = await prisma.ledgerEntry.groupBy({
    by: ["entryType"],
    where: { academyId },
    _sum: { amountMinor: true },
    _count: { _all: true },
  })
  const typeMap = new Map(byType.map((r) => [r.entryType, Number(r._sum.amountMinor ?? 0)]))

  // Spec §15 grouped payouts summary.
  const byGroup = await prisma.ledgerEntry.groupBy({
    by: ["payoutGroup"],
    where: { academyId, payoutGroup: { not: null } },
    _sum: { amountMinor: true },
  })

  const [recentTxns, recentInvoices, refundCount, unbalancedCount] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { academyId, entryType: "CHARGE" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        parentTxnId: true,
        productType: true,
        productId: true,
        amountMinor: true,
        currency: true,
        userId: true,
        createdAt: true,
      },
    }),
    prisma.invoice.findMany({
      where: { academyId },
      orderBy: { issuedAt: "desc" },
      take: 10,
      select: {
        id: true,
        invoiceNumber: true,
        netMinor: true,
        currency: true,
        issuedAt: true,
        recipientEmail: true,
      },
    }),
    prisma.ledgerEntry.count({
      where: { academyId, entryType: "REFUND_CHARGE" },
    }),
    (async () => {
      const res: Array<{ count: bigint }> = await prisma.$queryRaw`
        SELECT COUNT(*)::bigint AS count FROM (
          SELECT "parentTxnId", SUM("amountMinor") AS s
            FROM "LedgerEntry"
           WHERE "academyId" = ${academyId}
           GROUP BY "parentTxnId"
          HAVING SUM("amountMinor") <> 0
        ) x
      `
      return res[0]?.count ? Number(res[0].count) : 0
    })(),
  ])

  const charge = typeMap.get("CHARGE") ?? 0
  const discount = -(typeMap.get("DISCOUNT") ?? 0)
  const tax = -(typeMap.get("TAX") ?? 0)
  const netRevenue = charge - discount

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spec §16 immutable ledger + §15 grouped payouts. Amounts in minor
            units (cents), displayed as currency.
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/api/academy/finance/export?academyId=${academyId}`}
            download
          >
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </a>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat icon={TrendingUp} label="Gross charges" value={formatMinor(charge)} />
        <Stat icon={DollarSign} label="Net revenue" value={formatMinor(netRevenue)} />
        <Stat icon={Receipt} label="Tax collected" value={formatMinor(tax)} />
        <Stat icon={RefreshCcw} label="Refunds" value={refundCount} />
      </div>

      {unbalancedCount > 0 && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm">
            <Badge variant="destructive">⚠ Integrity warning</Badge>{" "}
            {unbalancedCount} transaction(s) with unbalanced ledger legs.
            Investigate via the nightly invariant cron output or Platform Owner
            audit log.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ledger summary by type</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {byType.length === 0 ? (
              <div className="text-muted-foreground">No ledger entries yet.</div>
            ) : (
              byType.map((r) => (
                <div key={r.entryType} className="flex justify-between items-center py-1">
                  <span className="font-mono text-xs">{r.entryType}</span>
                  <span className="font-mono">
                    {formatMinor(Number(r._sum.amountMinor ?? 0))}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Payout pool by group (§15)</CardTitle>
            <Link
              href="/academy/finance/payouts"
              className="text-xs text-primary hover:underline inline-flex items-center gap-1"
            >
              Manage payouts <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {byGroup.length === 0 ? (
              <div className="text-muted-foreground">No payouts owed yet.</div>
            ) : (
              byGroup.map((r) => (
                <div key={r.payoutGroup ?? "_"} className="flex justify-between items-center py-1">
                  <span className="font-mono text-xs">{r.payoutGroup}</span>
                  <span className="font-mono">
                    {formatMinor(-(Number(r._sum.amountMinor ?? 0)))}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent charges</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTxns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No charges yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentTxns.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {t.parentTxnId}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t.productType} · {t.productId.slice(-8)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(t.amountMinor, t.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      Refund flow at POST /api/academy/refunds
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              ) : (
                recentInvoices.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">
                      {i.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(i.issuedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs">
                      {i.recipientEmail ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(i.netMinor, i.currency)}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      <Link href={`/api/invoices/${i.id}`} className="underline">
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary" />
        <div>
          <div className="text-xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
