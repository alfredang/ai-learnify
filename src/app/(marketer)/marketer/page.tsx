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
import {
  DollarSign,
  Users,
  Ticket,
  Wallet,
  MousePointerClick,
} from "lucide-react"

/**
 * Spec §5 — Marketer performance dashboard.
 *
 * Commission is tracked via `LedgerEntry` rows where `entryType = "MARKETER"`
 * and `beneficiaryUserId = <marketer>`. Each such row is a negative amount
 * (outflow from the gross pool to the marketer); we flip the sign when
 * displaying "earned". Refund reversals (`REFUND_MARKETER`) net against it.
 *
 * "Clicks" — spec asks for clicks & conversions. Click tracking would need
 * a `/m/:code` redirect route + cookie attribution, which isn't implemented
 * yet; we surface it as "Not tracked yet" rather than faking a number.
 */

function formatMinor(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export default async function MarketerDashboardPage() {
  const session = await auth()
  if (!session?.user) return null
  const userId = session.user.id

  const [codes, commissionByType, recentEarnings, activeCodes] =
    await Promise.all([
      prisma.promoCode.findMany({
        where: { marketerUserId: userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          code: true,
          marketerCommissionBps: true,
          learnerDiscountBps: true,
          usageCount: true,
          usageLimit: true,
          isActive: true,
          validFrom: true,
          validTo: true,
          academy: { select: { name: true } },
        },
      }),
      prisma.ledgerEntry.groupBy({
        by: ["entryType", "currency"],
        where: {
          beneficiaryUserId: userId,
          entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
        },
        _sum: { amountMinor: true },
        _count: { _all: true },
      }),
      prisma.ledgerEntry.findMany({
        where: {
          beneficiaryUserId: userId,
          entryType: "MARKETER",
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          parentTxnId: true,
          amountMinor: true,
          currency: true,
          createdAt: true,
          payoutBatchId: true,
        },
      }),
      prisma.promoCode.count({
        where: { marketerUserId: userId, isActive: true },
      }),
    ])

  // Net signed MARKETER + REFUND_MARKETER = amount still owed/paid. Flip
  // sign to display as positive earnings.
  const byCurrency = new Map<string, { earnedMinor: number; legCount: number }>()
  for (const row of commissionByType) {
    const curr = byCurrency.get(row.currency) ?? { earnedMinor: 0, legCount: 0 }
    curr.earnedMinor += -(row._sum.amountMinor ?? 0)
    curr.legCount += row._count._all
    byCurrency.set(row.currency, curr)
  }

  const primaryCurrency = byCurrency.keys().next().value ?? "USD"
  const primary = byCurrency.get(primaryCurrency) ?? { earnedMinor: 0, legCount: 0 }

  const totalConversions = codes.reduce((a, c) => a + c.usageCount, 0)

  // "Unpaid" = legs not attached to a payout batch; "paid" = legs whose
  // batch has status PAID. Anything else (DRAFT/APPROVED) still counts as
  // owed but-not-yet-paid.
  const unpaidSum = await prisma.ledgerEntry.aggregate({
    where: {
      beneficiaryUserId: userId,
      entryType: "MARKETER",
      payoutBatchId: null,
    },
    _sum: { amountMinor: true },
  })
  const unpaidMinor = -(unpaidSum._sum.amountMinor ?? 0)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground mt-1">
          Spec §5. Campaign metrics tied to your promo codes. No access to
          learner personal data beyond attribution.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          icon={Users}
          label="Conversions"
          value={String(totalConversions)}
          hint={`${activeCodes} active code${activeCodes === 1 ? "" : "s"}`}
        />
        <Stat
          icon={DollarSign}
          label="Commission earned"
          value={formatMinor(primary.earnedMinor, primaryCurrency)}
          hint={`${primary.legCount} leg${primary.legCount === 1 ? "" : "s"} in ${primaryCurrency}`}
        />
        <Stat
          icon={Wallet}
          label="Owed to you"
          value={formatMinor(unpaidMinor, primaryCurrency)}
          hint="Not yet in a payout batch"
        />
        <Stat
          icon={MousePointerClick}
          label="Clicks"
          value="—"
          hint="Not tracked yet"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Your promo codes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Academy</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No promo codes assigned yet. An Academy Admin creates codes
                    and assigns you as the marketer.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">
                      {c.code}
                    </TableCell>
                    <TableCell className="text-xs">{c.academy.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {(c.marketerCommissionBps / 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {(c.learnerDiscountBps / 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {c.usageCount}
                      {c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                    </TableCell>
                    <TableCell>
                      {c.isActive ? (
                        <Badge variant="default">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
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
          <CardTitle className="text-base">Recent commission</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentEarnings.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No commission earned yet. Shares appear here once a learner
                    checks out with one of your promo codes.
                  </TableCell>
                </TableRow>
              ) : (
                recentEarnings.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.parentTxnId}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(-e.amountMinor, e.currency)}
                    </TableCell>
                    <TableCell>
                      {e.payoutBatchId ? (
                        <Badge variant="secondary">In batch</Badge>
                      ) : (
                        <Badge variant="outline">Unpaid</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground">
          Payout batches are generated by the Academy Admin in Finance →
          Payouts. Once your share lands in a batch and the batch is marked
          paid, the processor reference appears on the status column above.{" "}
          <Link
            href="/academy/finance/payouts"
            className="underline hover:text-foreground"
          >
            Learn more
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary" />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
          {hint && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {hint}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
