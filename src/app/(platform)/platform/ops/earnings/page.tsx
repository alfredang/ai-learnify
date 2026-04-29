import { redirect } from "next/navigation"
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
import { Wallet, Lock, ScrollText } from "lucide-react"

type MonthlyRow = { yyyymm: string; netMinor: number; legCount: number }

function fmtMoney(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

async function getMonthlyBreakdown(): Promise<MonthlyRow[]> {
  // Sum PLATFORM_SUPPORT (negative legs) + REFUND_PLATFORM (positive reversal
  // legs) per calendar month. Net should be roughly fee_per_txn * txn_count.
  type Row = { yyyymm: string; sum: bigint; cnt: bigint }
  const rows: Row[] = await prisma.$queryRaw`
    SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS "yyyymm",
           SUM("amountMinor")::bigint AS "sum",
           COUNT(*)::bigint AS "cnt"
      FROM "LedgerEntry"
     WHERE "entryType" IN ('PLATFORM_SUPPORT', 'REFUND_PLATFORM')
     GROUP BY date_trunc('month', "createdAt")
     ORDER BY date_trunc('month', "createdAt") DESC
     LIMIT 24
  `
  return rows.map((r) => ({
    yyyymm: r.yyyymm,
    // The sign is negative (cost to txn) — flip to positive earnings.
    netMinor: -Number(r.sum),
    legCount: Number(r.cnt),
  }))
}

export default async function PlatformSupportEarningsPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform/ops/earnings")
  const pr = session.user.platformRole
  if (pr !== "PLATFORM_OWNER" && pr !== "PLATFORM_SUPPORT") redirect("/")

  const [
    grossSupportAgg,
    refundSupportAgg,
    monthlyRows,
    pendingPayouts,
    paidPayouts,
    totalTxns,
  ] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { entryType: "PLATFORM_SUPPORT" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    prisma.ledgerEntry.aggregate({
      where: { entryType: "REFUND_PLATFORM" },
      _sum: { amountMinor: true },
      _count: true,
    }),
    getMonthlyBreakdown(),
    prisma.payoutBatch.findMany({
      where: {
        payoutGroup: "PLATFORM_SUPPORT",
        status: { in: ["DRAFT", "APPROVED"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        createdAt: true,
        totalMinor: true,
        currency: true,
      },
    }),
    prisma.payoutBatch.findMany({
      where: { payoutGroup: "PLATFORM_SUPPORT", status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 10,
      select: {
        id: true,
        status: true,
        paidAt: true,
        createdAt: true,
        totalMinor: true,
        currency: true,
      },
    }),
    prisma.ledgerEntry.findMany({
      where: { entryType: "PLATFORM_SUPPORT" },
      select: { parentTxnId: true },
      distinct: ["parentTxnId"],
    }),
  ])

  const grossMinor = -(grossSupportAgg._sum.amountMinor ?? 0)
  const refundMinor = -(refundSupportAgg._sum.amountMinor ?? 0)
  const netMinor = grossMinor + refundMinor

  const pendingTotal = pendingPayouts.reduce((s, p) => s + p.totalMinor, 0)

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Support earnings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §7. Read-only audit view of the aggregated fixed fee credited to
          Platform Support on every transaction. The fee is{" "}
          <strong className="text-foreground">non-negotiable</strong> per
          transaction and configured by the Platform Owner under{" "}
          <code className="font-mono">/platform/policy</code>.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Wallet}
          label="Net earned (all-time)"
          value={fmtMoney(netMinor)}
          hint={`${totalTxns.length} transactions`}
        />
        <StatCard
          icon={Wallet}
          label="Gross collected"
          value={fmtMoney(grossMinor)}
          hint={`${grossSupportAgg._count} legs`}
        />
        <StatCard
          icon={Wallet}
          label="Refunded back"
          value={fmtMoney(-refundMinor)}
          hint={`${refundSupportAgg._count} reversal legs`}
        />
        <StatCard
          icon={Wallet}
          label="Pending payout"
          value={fmtMoney(pendingTotal)}
          hint={`${pendingPayouts.length} batch(es)`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Net earned</TableHead>
                <TableHead className="text-right">Legs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {monthlyRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">
                    No Platform Support legs recorded yet.
                  </TableCell>
                </TableRow>
              ) : (
                monthlyRows.map((r) => (
                  <TableRow key={r.yyyymm}>
                    <TableCell className="font-mono text-xs">{r.yyyymm}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMoney(r.netMinor)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {r.legCount}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pendingPayouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending payout batches</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id.slice(0, 12)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMoney(p.totalMinor, p.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {paidPayouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent paid payouts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Paid at</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paidPayouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.id.slice(0, 12)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMoney(p.totalMinor, p.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.paidAt ? new Date(p.paidAt).toLocaleString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="border-dashed">
        <CardContent className="p-5 flex items-start gap-3">
          <Lock className="h-6 w-6 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground space-y-1">
            <p>
              <strong className="text-foreground">Read-only.</strong> Platform
              Support cannot adjust or approve these payouts. Approval and
              payment are performed by the Platform Owner from the academy
              payouts view, and every step is recorded as an audit event.
            </p>
            <p className="flex items-center gap-2 text-xs">
              <ScrollText className="h-3.5 w-3.5" /> Auditable forever — every
              ledger leg is append-only.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="text-xl font-bold truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && (
            <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
