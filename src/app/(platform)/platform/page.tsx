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
  Activity,
} from "lucide-react"

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
  ])

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">
          Global view across all academies.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Academies" value={academyCount} />
        <StatCard icon={Users} label="Total users" value={userCount} />
        <StatCard icon={Users} label="Learners" value={learnerCount} />
        <StatCard icon={BookOpen} label="Published courses" value={courseCount} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Award} label="Certificates issued" value={certCount} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
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
            <h3 className="font-semibold text-sm">Locked rules</h3>
            <p className="text-sm text-muted-foreground mt-1">
              The learning model (self-paced, async, no live classes, no manual
              grading) and the certification engine (content + assessment +
              survey + expiry) are locked in code.
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
