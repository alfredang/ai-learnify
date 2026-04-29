import Link from "next/link"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Building2,
  Users,
  BookOpen,
  Award,
  Shield,
  ScrollText,
  Activity,
  DollarSign,
  TrendingUp,
  Sliders,
  Tag,
  CheckCircle2,
} from "lucide-react"

type AcademyRow = {
  academyId: string
  name: string
  slug: string
  grossMinor: number
  netMinor: number
  currency: string
  learners: number
  courses: number
  certs: number
}

function fmtMoney(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100)
}

async function getAcademyBreakdown(): Promise<AcademyRow[]> {
  const academies = await prisma.academy.findMany({
    where: { isActive: true },
    select: { id: true, name: true, slug: true, primaryCurrency: true },
    orderBy: { name: "asc" },
  })

  const rows = await Promise.all(
    academies.map(async (a) => {
      const courseIds = (
        await prisma.course.findMany({
          where: { academyId: a.id },
          select: { id: true },
        })
      ).map((c) => c.id)

      const [grossAgg, netAgg, learners, courses, certs] = await Promise.all([
        prisma.ledgerEntry.aggregate({
          where: { academyId: a.id, entryType: "CHARGE" },
          _sum: { amountMinor: true },
        }),
        prisma.ledgerEntry.aggregate({
          where: {
            academyId: a.id,
            entryType: { in: ["ACADEMY", "REFUND_ACADEMY"] },
          },
          _sum: { amountMinor: true },
        }),
        prisma.academyMembership.count({
          where: { academyId: a.id, role: "LEARNER" },
        }),
        prisma.course.count({
          where: { academyId: a.id, status: "PUBLISHED" },
        }),
        courseIds.length === 0
          ? 0
          : prisma.certificate.count({
              where: { revokedAt: null, courseId: { in: courseIds } },
            }),
      ])
      return {
        academyId: a.id,
        name: a.name,
        slug: a.slug,
        grossMinor: grossAgg._sum.amountMinor ?? 0,
        netMinor: netAgg._sum.amountMinor ?? 0,
        currency: a.primaryCurrency,
        learners,
        courses,
        certs,
      }
    })
  )
  return rows
}

async function getGlobalStats() {
  const [
    academyCount,
    userCount,
    learnerCount,
    courseCount,
    certCount,
    chargeAgg,
    discountAgg,
    marketerAgg,
    supportAgg,
    last30dCharge,
    last30dEnrolments,
    last30dCerts,
  ] = await Promise.all([
    prisma.academy.count({ where: { isActive: true } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.academyMembership.count({ where: { role: "LEARNER" } }),
    prisma.course.count({ where: { status: "PUBLISHED" } }),
    prisma.certificate.count({ where: { revokedAt: null } }),
    prisma.ledgerEntry.aggregate({
      where: { entryType: { in: ["CHARGE", "REFUND_CHARGE"] } },
      _sum: { amountMinor: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { entryType: { in: ["DISCOUNT", "REFUND_DISCOUNT"] } },
      _sum: { amountMinor: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { entryType: { in: ["MARKETER", "REFUND_MARKETER"] } },
      _sum: { amountMinor: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { entryType: { in: ["PLATFORM_SUPPORT", "REFUND_PLATFORM"] } },
      _sum: { amountMinor: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: {
        entryType: "CHARGE",
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      _sum: { amountMinor: true },
    }),
    prisma.enrollment.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    prisma.certificate.count({
      where: {
        issuedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        revokedAt: null,
      },
    }),
  ])

  return {
    academyCount,
    userCount,
    learnerCount,
    courseCount,
    certCount,
    grossMinor: chargeAgg._sum.amountMinor ?? 0,
    discountMinor: discountAgg._sum.amountMinor ?? 0,
    marketerMinor: marketerAgg._sum.amountMinor ?? 0,
    supportMinor: supportAgg._sum.amountMinor ?? 0,
    last30dGrossMinor: last30dCharge._sum.amountMinor ?? 0,
    last30dEnrolments,
    last30dCerts,
  }
}

export default async function PlatformOwnerDashboardPage() {
  const session = await auth()
  if (!session?.user) return null
  // Only Owner sees the strategic dashboard; Support is rerouted via layout.
  if (session.user.platformRole !== "PLATFORM_OWNER") return null

  const [stats, breakdown, recentAudit] = await Promise.all([
    getGlobalStats(),
    getAcademyBreakdown(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, resourceType: true, createdAt: true },
    }),
  ])

  // Display gross / discount in the most-used academy currency. Mixed-currency
  // academies are summed separately in the breakdown table, so this is a
  // best-effort headline number.
  const headlineCurrency = breakdown[0]?.currency ?? "USD"

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Strategic Overview
        </h1>
        <p className="text-muted-foreground mt-1">
          Global revenue, academy performance, and platform growth across all
          tenants.
        </p>
      </div>

      {/* Revenue */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Gross revenue"
          value={fmtMoney(stats.grossMinor, headlineCurrency)}
          hint="All-time CHARGE − REFUND"
        />
        <StatCard
          icon={Tag}
          label="Discounts redeemed"
          value={fmtMoney(Math.abs(stats.discountMinor), headlineCurrency)}
          hint="DISCOUNT legs (absolute)"
        />
        <StatCard
          icon={Users}
          label="Marketer paid"
          value={fmtMoney(Math.abs(stats.marketerMinor), headlineCurrency)}
          hint="Net commission to marketers"
        />
        <StatCard
          icon={Shield}
          label="Platform Support"
          value={fmtMoney(Math.abs(stats.supportMinor), headlineCurrency)}
          hint="Aggregated fixed fees"
        />
      </div>

      {/* Reach */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Academies" value={stats.academyCount} />
        <StatCard icon={Users} label="Total users" value={stats.userCount} />
        <StatCard icon={Users} label="Learners" value={stats.learnerCount} />
        <StatCard
          icon={BookOpen}
          label="Published courses"
          value={stats.courseCount}
        />
      </div>

      {/* 30-day growth */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4" /> Last 30 days
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GrowthTile
            label="Gross"
            value={fmtMoney(stats.last30dGrossMinor, headlineCurrency)}
          />
          <GrowthTile label="New enrolments" value={stats.last30dEnrolments} />
          <GrowthTile
            label="Certificates issued"
            value={stats.last30dCerts}
            icon={Award}
          />
        </CardContent>
      </Card>

      {/* Per-academy table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Academy performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academy</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net to Academy</TableHead>
                <TableHead className="text-right">Learners</TableHead>
                <TableHead className="text-right">Courses</TableHead>
                <TableHead className="text-right">Certs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {breakdown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                    No academies yet.
                  </TableCell>
                </TableRow>
              ) : (
                breakdown.map((a) => (
                  <TableRow key={a.academyId}>
                    <TableCell className="font-medium">
                      {a.name}
                      <div className="text-[10px] text-muted-foreground font-mono">
                        /{a.slug}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMoney(a.grossMinor, a.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {fmtMoney(a.netMinor, a.currency)}
                    </TableCell>
                    <TableCell className="text-right">{a.learners}</TableCell>
                    <TableCell className="text-right">{a.courses}</TableCell>
                    <TableCell className="text-right">{a.certs}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Controls + recent audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <QuickLink href="/platform/policy" icon={Sliders} label="Monetisation policy" />
            <QuickLink href="/platform/promos" icon={Tag} label="Promo codes (cross-academy)" />
            <QuickLink href="/platform/integrity" icon={CheckCircle2} label="Ledger integrity" />
            <QuickLink href="/platform/audit" icon={ScrollText} label="Global audit log" />
            <QuickLink href="/platform/users" icon={Users} label="Users & roles" />
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
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="font-mono text-xs truncate">{e.action}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
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
          <Shield className="h-10 w-10 text-muted-foreground shrink-0" />
          <div>
            <h3 className="font-semibold text-sm">Locked rules</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The learning model (self-paced, async, no live classes, no manual
              grading) and the certification engine (content ≥50% + assessment
              ≥80% + survey + before expiry) are locked in code and cannot be
              changed from the policy page — by design.
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

function GrowthTile({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-md border p-4 flex items-start gap-3">
      {Icon && <Icon className="h-5 w-5 text-primary mt-0.5" />}
      <div>
        <div className="text-xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
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
