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
import { Activity, ShieldCheck } from "lucide-react"
import { formatMinor } from "@/lib/marketer"

const PAGE_SIZE = 50

/**
 * Marketer conversions feed. One row per MARKETER ledger leg credited to
 * this marketer (or its REFUND_MARKETER reversal). Spec §3 — marketers
 * have no access to learner personal data beyond the attribution itself,
 * so we never join through to the learner User row.
 */
export default async function MarketerConversionsPage() {
  const session = await auth()
  if (!session?.user) return null
  const userId = session.user.id

  // Pull MARKETER + REFUND_MARKETER legs. For each conversion we also need
  // the matching CHARGE leg (same parentTxnId) to display the gross sale
  // amount that produced the commission. One round-trip for each so we
  // only return the columns we need.
  const legs = await prisma.ledgerEntry.findMany({
    where: {
      beneficiaryUserId: userId,
      entryType: { in: ["MARKETER", "REFUND_MARKETER"] },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    select: {
      id: true,
      createdAt: true,
      entryType: true,
      amountMinor: true,
      currency: true,
      productType: true,
      productId: true,
      parentTxnId: true,
      promoCode: { select: { code: true } },
    },
  })

  const parentIds = Array.from(new Set(legs.map((l) => l.parentTxnId)))
  const chargeLegs = parentIds.length
    ? await prisma.ledgerEntry.findMany({
        where: {
          parentTxnId: { in: parentIds },
          entryType: { in: ["CHARGE", "REFUND_CHARGE"] },
        },
        select: { parentTxnId: true, amountMinor: true, entryType: true },
      })
    : []
  const grossByTxn = new Map<string, number>()
  for (const c of chargeLegs) {
    const prev = grossByTxn.get(c.parentTxnId) ?? 0
    // CHARGE is positive, REFUND_CHARGE is negative; sum gives net gross.
    grossByTxn.set(c.parentTxnId, prev + c.amountMinor)
  }

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conversions</h1>
        <p className="text-muted-foreground mt-1">
          Every commission event credited to your account. The most recent
          {" "}
          {PAGE_SIZE} are shown.
        </p>
      </div>

      <Card className="border-muted">
        <CardContent className="p-4 flex items-start gap-3 text-sm">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">
              Attribution only.
            </span>{" "}
            Spec §3 — you can see which of your codes produced a sale and
            for how much, but never the learner&apos;s name, email, or any
            other personal data.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Commission events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Txn ID</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {legs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No conversions yet.
                  </TableCell>
                </TableRow>
              ) : (
                legs.map((leg) => {
                  const isRefund = leg.entryType === "REFUND_MARKETER"
                  const commission = isRefund
                    ? leg.amountMinor
                    : -leg.amountMinor
                  const gross = grossByTxn.get(leg.parentTxnId) ?? 0
                  return (
                    <TableRow key={leg.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(leg.createdAt).toLocaleString()}
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
                      <TableCell className="text-right font-mono text-xs">
                        {formatMinor(gross, leg.currency)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono ${
                          commission < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {formatMinor(commission, leg.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isRefund ? "destructive" : "secondary"}
                        >
                          {isRefund ? "Refund" : "Commission"}
                        </Badge>
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
