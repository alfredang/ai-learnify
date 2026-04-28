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
  Activity,
  DollarSign,
  MousePointerClick,
  Ticket,
  Users,
  Wallet,
} from "lucide-react"
import { formatMinor, marketerLifetimeCommission } from "@/lib/marketer"

/**
 * Marketer overview. Spec §5 — clicks (not yet tracked), conversions,
 * commission earned, and pending payable. No learner PII beyond the
 * promo-code-driven attribution.
 */
export default async function MarketerOverviewPage() {
  const session = await auth()
  if (!session?.user) return null
  const userId = session.user.id

  const [codes, activeCodes, lifetime, recentLegs] = await Promise.all([
    prisma.promoCode.count({ where: { marketerUserId: userId } }),
    prisma.promoCode.count({
      where: { marketerUserId: userId, isActive: true },
    }),
    marketerLifetimeCommission(userId),
    // Most recent commission events to show what's coming through. We
    // intentionally do NOT join through the User table — attribution only.
    prisma.ledgerEntry.findMany({
      where: {
        beneficiaryUserId: userId,
        entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        createdAt: true,
        entryType: true,
        amountMinor: true,
        currency: true,
        productType: true,
        parentTxnId: true,
        promoCode: { select: { code: true } },
      },
    }),
    // Conversion totals come from PromoCode.usageCount, summed below.
  ])

  // Sum of usage on every code assigned to this marketer = lifetime conversions.
  const usageRows = await prisma.promoCode.findMany({
    where: { marketerUserId: userId },
    select: { usageCount: true },
  })
  const totalConversions = usageRows.reduce((a, c) => a + c.usageCount, 0)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="text-muted-foreground mt-1">
          Spec §5. Conversions and commission tied to your promo codes. You
          have no access to learner personal data — only the attribution
          itself.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          icon={MousePointerClick}
          label="Clicks"
          value="—"
          hint="Not tracked yet"
        />
        <Stat
          icon={Users}
          label="Conversions"
          value={String(totalConversions)}
          hint={`across ${codes} code${codes === 1 ? "" : "s"}`}
        />
        <Stat
          icon={DollarSign}
          label="Lifetime commission"
          value={formatMinor(lifetime.totalMinor, lifetime.currency)}
          hint="Net of refunds"
        />
        <Stat
          icon={Wallet}
          label="Pending payable"
          value={formatMinor(lifetime.unbatchedMinor, lifetime.currency)}
          hint="Not yet in a payout batch"
        />
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent commission events
          </CardTitle>
          <Link
            href="/marketer/conversions"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            View all conversions →
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentLegs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No commission events yet. They appear here as soon as a
                    learner checks out with one of your codes.
                  </TableCell>
                </TableRow>
              ) : (
                recentLegs.map((leg) => {
                  const isRefund = leg.entryType === "REFUND_MARKETER"
                  const display = isRefund ? leg.amountMinor : -leg.amountMinor
                  return (
                    <TableRow key={leg.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(leg.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {leg.promoCode?.code ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {leg.productType}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRefund ? "destructive" : "secondary"}>
                          {isRefund ? "Refund" : "Commission"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          display < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatMinor(display, leg.currency)}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Quick links
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div>
            <Link
              href="/marketer/promo-codes"
              className="text-primary hover:underline"
            >
              Promo Codes
            </Link>{" "}
            — codes assigned to you, with discount and commission rates.
          </div>
          <div>
            <Link
              href="/marketer/conversions"
              className="text-primary hover:underline"
            >
              Conversions
            </Link>{" "}
            — every commission event with attribution. No learner PII.
          </div>
          <div>
            <Link
              href="/marketer/payouts"
              className="text-primary hover:underline"
            >
              Payouts
            </Link>{" "}
            — immutable ledger of what you&apos;ve earned and when each batch
            was paid.
          </div>
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
