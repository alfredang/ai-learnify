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
import { DollarSign, Lock, Wallet } from "lucide-react"
import { formatMinor, marketerLifetimeCommission } from "@/lib/marketer"

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  APPROVED: "outline",
  PAID: "default",
  CANCELLED: "destructive",
}

/**
 * Spec §15 grouped payouts + §16 immutable ledger as seen by the marketer.
 *
 *  • Top: lifetime / paid / pending KPIs (sourced from MARKETER legs).
 *  • Middle: payout batches that include any of this marketer's legs,
 *    with the per-batch commission total computed from the attached legs.
 *  • Bottom: every MARKETER / REFUND_MARKETER leg, append-only.
 */
export default async function MarketerPayoutsPage() {
  const session = await auth()
  if (!session?.user) return null
  const userId = session.user.id

  const lifetime = await marketerLifetimeCommission(userId)

  // All ledger legs belonging to this marketer, oldest first for the
  // immutable view (newest first reads better to humans, so we reverse on
  // the way in but render newest first).
  const allLegs = await prisma.ledgerEntry.findMany({
    where: {
      beneficiaryUserId: userId,
      entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      entryType: true,
      amountMinor: true,
      currency: true,
      productType: true,
      parentTxnId: true,
      payoutBatchId: true,
      promoCode: { select: { code: true } },
      payoutBatch: {
        select: {
          id: true,
          status: true,
          periodStart: true,
          periodEnd: true,
          paidAt: true,
          processorRef: true,
        },
      },
    },
  })

  // Group legs by batch so we can show per-batch totals from this
  // marketer's perspective (the academy-wide total on PayoutBatch.totalMinor
  // is everyone's commission combined for that group).
  type BatchRow = {
    id: string
    status: string
    periodStart: Date
    periodEnd: Date
    paidAt: Date | null
    processorRef: string | null
    currency: string
    legCount: number
    totalMinor: number
  }
  const batches = new Map<string, BatchRow>()
  for (const leg of allLegs) {
    if (!leg.payoutBatchId || !leg.payoutBatch) continue
    const prev =
      batches.get(leg.payoutBatchId) ?? {
        id: leg.payoutBatchId,
        status: leg.payoutBatch.status,
        periodStart: leg.payoutBatch.periodStart,
        periodEnd: leg.payoutBatch.periodEnd,
        paidAt: leg.payoutBatch.paidAt,
        processorRef: leg.payoutBatch.processorRef,
        currency: leg.currency,
        legCount: 0,
        totalMinor: 0,
      }
    prev.legCount += 1
    // Negate: MARKETER amounts are stored negative, refunds positive. The
    // marketer wants to see what they earned net.
    prev.totalMinor += -leg.amountMinor
    batches.set(leg.payoutBatchId, prev)
  }
  const batchRows = Array.from(batches.values()).sort(
    (a, b) => b.periodEnd.getTime() - a.periodEnd.getTime()
  )

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payouts</h1>
        <p className="text-muted-foreground mt-1">
          Spec §15 grouped payouts. Your commission is paid externally by the
          academy; each batch tracks its status. The ledger below is
          append-only — corrections appear as reversal entries, never edits.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <Stat
          icon={Lock}
          label="Paid out"
          value={formatMinor(lifetime.paidMinor, lifetime.currency)}
          hint="In batches marked PAID"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Payout batches
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Legs</TableHead>
                <TableHead className="text-right">Your share</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Processor ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No batches yet. Your commission moves to a batch when the
                    Academy Admin generates one for the marketer payout group.
                  </TableCell>
                </TableRow>
              ) : (
                batchRows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell
                      className="font-mono text-[10px] text-muted-foreground"
                      title={b.id}
                    >
                      {b.id.slice(0, 10)}…
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(b.periodStart).toLocaleDateString()} —{" "}
                      {new Date(b.periodEnd).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[b.status] ?? "secondary"}>
                        {b.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {b.legCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(b.totalMinor, b.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.paidAt
                        ? new Date(b.paidAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.processorRef ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" /> Immutable ledger
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            Append-only — refunds appear as new reversal rows.
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allLegs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No ledger entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                allLegs.map((leg) => {
                  const isRefund = leg.entryType === "REFUND_MARKETER"
                  const display = isRefund ? leg.amountMinor : -leg.amountMinor
                  return (
                    <TableRow key={leg.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(leg.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell
                        className="font-mono text-[10px] text-muted-foreground"
                        title={leg.parentTxnId}
                      >
                        {leg.parentTxnId.slice(0, 12)}…
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {leg.promoCode?.code ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {leg.productType}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isRefund ? "destructive" : "secondary"}>
                          {leg.entryType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {leg.payoutBatch ? (
                          <Badge
                            variant={
                              STATUS_VARIANT[leg.payoutBatch.status] ??
                              "secondary"
                            }
                          >
                            {leg.payoutBatch.status}
                          </Badge>
                        ) : (
                          <span className="text-[10px]">unbatched</span>
                        )}
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
