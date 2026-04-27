import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Building2,
  Users,
  BookOpen,
  Award,
  Shield,
  ScrollText,
  Sliders,
  Activity,
  DollarSign,
  TrendingUp,
  Wallet,
  AlertTriangle,
} from "lucide-react"

function formatMinor(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minor / 100)
}

export default async function PlatformOwnerDashboardPage() {
  const session = await auth()
  if (!session?.user) return null

  const [
    academyCount,
    userCount,
    learnerCount,
    courseCount,
    certCount,
    recentAudit,
    grossByCurrency,
    payoutsByStatus,
    unbalancedResult,
    topAcademiesByRevenue,
  ] = await Promise.all([
    prisma.academy.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.academyMembership.count({ where: { role: "LEARNER" } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.certificate.count({ where: { revokedAt: null } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, action: true, resourceType: true, createdAt: true },
    }),
    // Spec §6 step 1 — global revenue. Sum of all CHARGE legs, grouped by
    // currency since we're multi-tenant & multi-currency.
    prisma.ledgerEntry.groupBy({
      by: ["currency"],
      where: { entryType: "CHARGE" },
      _sum: { amountMinor: true },
      _count: { _all: true },
    }),
    prisma.payoutBatch.groupBy({
      by: ["status"],
      _sum: { totalMinor: true },
      _count: { _all: true },
    }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT "parentTxnId", SUM("amountMinor") AS s
          FROM "LedgerEntry"
         GROUP BY "parentTxnId"
        HAVING SUM("amountMinor") <> 0
      ) x
    `,
    prisma.ledgerEntry.groupBy({
      by: ["academyId"],
      where: { entryType: "CHARGE" },
      _sum: { amountMinor: true },
      orderBy: { _sum: { amountMinor: "desc" } },
      take: 5,
    }),
  ])

  const totalGrossMinor = grossByCurrency.reduce(
    (acc, row) => acc + (row._sum.amountMinor ?? 0),
    0
  )
  // Currency label is approximate when academies span multiple — we show the
  // dominant one by transaction count so the top-line number is readable.
  const dominantCurrency =
    grossByCurrency.sort((a, b) => b._count._all - a._count._all)[0]?.currency ??
    "USD"
  const mixedCurrencies = grossByCurrency.length > 1

  const paidBatch = payoutsByStatus.find((r) => r.status === "PAID")
  const pendingBatch = payoutsByStatus.filter(
    (r) => r.status === "DRAFT" || r.status === "APPROVED"
  )
  const totalPaidMinor = paidBatch?._sum.totalMinor ?? 0
  const totalPendingMinor = pendingBatch.reduce(
    (a, r) => a + (r._sum.totalMinor ?? 0),
    0
  )
  const unbalancedCount = Number(unbalancedResult[0]?.count ?? 0)

  const topAcademyIds = topAcademiesByRevenue
    .map((r) => r.academyId)
    .filter((id): id is string => !!id)
  const topAcademies = topAcademyIds.length
    ? await prisma.academy.findMany({
        where: { id: { in: topAcademyIds } },
        select: { id: true, name: true, slug: true },
      })
    : []
  const topAcademiesWithTotals = topAcademiesByRevenue
    .map((r) => {
      const a = topAcademies.find((x) => x.id === r.academyId)
      return a
        ? { ...a, grossMinor: r._sum.amountMinor ?? 0 }
        : null
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">
          Spec §6. Global view across all academies.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label={`Gross revenue${mixedCurrencies ? " (mixed)" : ""}`}
          value={formatMinor(totalGrossMinor, dominantCurrency)}
          hint={`${grossByCurrency.reduce((a, r) => a + r._count._all, 0)} charges across ${grossByCurrency.length || 1} currenc${grossByCurrency.length === 1 ? "y" : "ies"}`}
        />
        <StatCard
          icon={Wallet}
          label="Paid to stakeholders"
          value={formatMinor(totalPaidMinor, dominantCurrency)}
          hint={`${paidBatch?._count._all ?? 0} paid batches`}
        />
        <StatCard
          icon={DollarSign}
          label="Pending payouts"
          value={formatMinor(totalPendingMinor, dominantCurrency)}
          hint={`${pendingBatch.reduce((a, r) => a + r._count._all, 0)} batches in draft/approved`}
        />
        <StatCard icon={Award} label="Certificates issued" value={certCount} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Academies" value={academyCount} />
        <StatCard icon={Users} label="Total users" value={userCount} />
        <StatCard icon={Users} label="Learners" value={learnerCount} />
        <StatCard icon={BookOpen} label="Published courses" value={courseCount} />
      </div>

      {unbalancedCount > 0 && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-destructive">
                {unbalancedCount} transaction{unbalancedCount === 1 ? "" : "s"} with unbalanced ledger legs
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Debits and credits don&apos;t net to zero. The nightly
                invariant cron at{" "}
                <code className="font-mono">/api/cron/ledger-invariant</code>{" "}
                is where these surface — investigate before the next payout.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {topAcademiesWithTotals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top academies by revenue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {topAcademiesWithTotals.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between py-1.5 border-b last:border-b-0 text-sm"
              >
                <Link
                  href={`/academy/finance`}
                  className="font-medium hover:underline"
                >
                  {a.name}
                </Link>
                <span className="font-mono text-xs">
                  {formatMinor(a.grossMinor, dominantCurrency)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickLink href="/platform/policy" icon={Sliders} label="Monetisation policy" />
            <QuickLink href="/platform/audit" icon={ScrollText} label="Global audit log" />
            <QuickLink href="/platform/ops" icon={Activity} label="Operations view" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent events</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <div className="text-sm text-muted-foreground">No events yet.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentAudit.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">{e.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-5 flex items-start gap-4">
          <Shield className="h-10 w-10 text-muted-foreground" />
          <div>
            <h3 className="font-semibold text-sm">Locked rules (spec §6 step 2)</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The learning model (self-paced, async, no live classes, no manual
              grading) and the certification engine (content + assessment +
              survey + expiry) are locked in code. Platform Owner can tune the
              platform support fee, marketer commission default, and default
              Academy/Developer split — but not override the locked rules.
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
          <div className="text-2xl font-bold truncate">{value}</div>
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

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-sm"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </Link>
  )
}
