import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { findUnbalancedTransactions } from "@/lib/ledger"
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
import { CheckCircle2, AlertTriangle, ScrollText } from "lucide-react"
import { RunCheckButton } from "./run-check-button"

export default async function IntegrityPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform/integrity")
  if (session.user.platformRole !== "PLATFORM_OWNER") redirect("/platform/ops")

  const [unbalanced, lastCheck, lastViolation, recentLedgerAudit, totalLedgerLegs, totalTxns] =
    await Promise.all([
      findUnbalancedTransactions(),
      prisma.auditLog.findFirst({
        where: { action: "ledger.invariant_check" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true, userId: true },
      }),
      prisma.auditLog.findFirst({
        where: { action: "ledger.invariant_violation" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, metadata: true },
      }),
      prisma.auditLog.findMany({
        where: { resourceType: "ledger" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.ledgerEntry.count(),
      prisma.ledgerEntry
        .findMany({ select: { parentTxnId: true }, distinct: ["parentTxnId"] })
        .then((r) => r.length),
    ])

  const isHealthy = unbalanced.length === 0

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Ledger integrity</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Spec §16. The ledger is append-only and double-entry; every
            <code className="font-mono mx-1">parentTxnId</code>
            must sum to zero. Imbalances mean a missing or extra leg —
            investigate immediately.
          </p>
        </div>
        <RunCheckButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-start gap-3">
            {isHealthy ? (
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-destructive" />
            )}
            <div>
              <div className="text-2xl font-bold">
                {isHealthy ? "Balanced" : "Imbalance"}
              </div>
              <div className="text-xs text-muted-foreground">
                {isHealthy
                  ? "All transactions sum to zero"
                  : `${unbalanced.length} parentTxnId(s) do not sum to zero`}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-bold">{totalLedgerLegs}</div>
            <div className="text-xs text-muted-foreground">Ledger legs</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Across {totalTxns} parent transactions
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-sm font-medium">Last manual check</div>
            <div className="text-xs text-muted-foreground mt-1">
              {lastCheck
                ? new Date(lastCheck.createdAt).toLocaleString()
                : "Never run"}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Last violation logged:{" "}
              {lastViolation
                ? new Date(lastViolation.createdAt).toLocaleString()
                : "never"}
            </div>
          </CardContent>
        </Card>
      </div>

      {!isHealthy && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-base text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Unbalanced transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>parentTxnId</TableHead>
                  <TableHead className="text-right">Sum (minor)</TableHead>
                  <TableHead className="text-right">Leg count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unbalanced.slice(0, 50).map((u) => (
                  <TableRow key={u.parentTxnId}>
                    <TableCell className="font-mono text-xs">
                      {u.parentTxnId}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {u.sumMinor}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {u.legCount}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {unbalanced.length > 50 && (
              <div className="p-3 text-xs text-muted-foreground border-t">
                Showing 50 of {unbalanced.length} unbalanced transactions.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ScrollText className="h-4 w-4" /> Recent ledger audit events
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recentLedgerAudit.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">
              No ledger-related audit events yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLedgerAudit.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">
                      {e.action.includes("violation") ? (
                        <Badge variant="destructive">{e.action}</Badge>
                      ) : (
                        e.action
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {e.resourceType}
                      {e.resourceId ? `:${e.resourceId.slice(0, 8)}` : ""}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardContent className="p-5 text-sm text-muted-foreground space-y-1">
          <p>
            A nightly cron at <code>/api/cron/ledger-invariant</code> runs the
            same check automatically and writes a{" "}
            <code>ledger.invariant_violation</code> audit event when it finds
            anything wrong. Configure <code>CRON_SECRET</code> and your cron
            scheduler (Coolify scheduled task or external cron) to invoke it daily.
          </p>
          <Link
            href="/platform/audit"
            className="text-primary hover:underline text-xs"
          >
            See the full audit log →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
