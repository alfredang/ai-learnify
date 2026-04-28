import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Activity, Database, Shield, Clock } from "lucide-react"

function cutoff24h(): Date {
  return new Date(Date.now() - 24 * 60 * 60 * 1000)
}

export default async function PlatformOpsPage() {
  // Sub-metrics Platform Support can see without any business data.
  const [auditCount24h, userActiveCount, academyCount, lastAuditEvent] = await Promise.all([
    prisma.auditLog.count({
      where: { createdAt: { gt: cutoff24h() } },
    }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.academy.count({ where: { isActive: true } }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, action: true },
    }),
  ])

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
        <p className="text-muted-foreground mt-1">
          Spec §7. Infrastructure-focused view — no business interference.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OpsCard icon={Activity} label="Audit events (24h)" value={auditCount24h} />
        <OpsCard icon={Database} label="Academies active" value={academyCount} />
        <OpsCard icon={Shield} label="Users active" value={userActiveCount} />
        <OpsCard
          icon={Clock}
          label="Last event"
          value={
            lastAuditEvent
              ? new Date(lastAuditEvent.createdAt).toLocaleTimeString()
              : "—"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <StatusRow service="Next.js app" />
          <StatusRow service="Postgres" />
          <StatusRow service="Prisma client" />
          <StatusRow service="Middleware" />
          <p className="text-xs text-muted-foreground mt-4">
            Real uptime + backup + scaling dashboards integrate in Phase 10
            (hardening). This view is a placeholder for wiring into Grafana /
            Sentry / UptimeRobot.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function OpsCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center gap-3">
        <Icon className="h-7 w-7 text-primary" />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({ service }: { service: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{service}</span>
      <Badge variant="default" className="bg-green-600 hover:bg-green-600">
        Operational
      </Badge>
    </div>
  )
}
