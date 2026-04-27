import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { listPayoutBatches, unbatchedPoolByGroup } from "@/lib/payouts"
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
import { ArrowLeft } from "lucide-react"
import { PayoutBatchManager } from "./payout-batch-manager"
import { PayoutRowActions } from "./payout-row-actions"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({
      where: { isActive: true },
      select: { id: true },
    })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

function formatMinor(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  APPROVED: "outline",
  PAID: "default",
  CANCELLED: "destructive",
}

export default async function AcademyPayoutsPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return null

  const [pool, batches] = await Promise.all([
    unbatchedPoolByGroup(academyId),
    listPayoutBatches(academyId),
  ])

  const hasNegativeRow = pool.some((p) => p.amountMinor < 0)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <Link
          href="/academy/finance"
          className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Finance
        </Link>
        <h1 className="text-2xl font-bold mt-2">Payouts</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §15 grouped payouts. Generate a batch for Academy / Developer /
          Marketer / Platform Support for any period; payments are made
          externally and the batch tracks status.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Unbatched pool by group</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Legs</TableHead>
                <TableHead className="text-right">Owed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pool.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Nothing currently owed — all share legs are either batched
                    or there have been no charges.
                  </TableCell>
                </TableRow>
              ) : (
                pool.map((p) => (
                  <TableRow key={`${p.payoutGroup}-${p.currency}`}>
                    <TableCell className="font-mono text-xs">
                      {p.payoutGroup}
                    </TableCell>
                    <TableCell className="text-xs">{p.currency}</TableCell>
                    <TableCell className="text-right text-xs">
                      {p.legCount}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatMinor(p.amountMinor, p.currency)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
        {hasNegativeRow && (
          <CardContent className="pt-2 pb-4 text-xs text-destructive">
            Negative rows mean refunds exceed unpaid shares in that group /
            currency. Investigate before generating a batch — the build will
            refuse if the net total is ≤ 0.
          </CardContent>
        )}
      </Card>

      <PayoutBatchManager academyId={academyId} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Batch history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Approved</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Processor ref</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    No payout batches yet.
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">
                      {b.payoutGroup}
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
                    <TableCell className="text-right font-mono">
                      {formatMinor(b.totalMinor, b.currency)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.approvedAt
                        ? new Date(b.approvedAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.paidAt ? new Date(b.paidAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {b.processorRef ?? "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <PayoutRowActions batchId={b.id} status={b.status} />
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
