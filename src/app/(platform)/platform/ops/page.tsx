import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { integrationStatus } from "@/lib/env"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Activity,
  Database,
  Shield,
  Clock,
  CreditCard,
  Cloud,
  Mail,
  Lock,
  Sparkles,
  Wallet,
  Webhook,
} from "lucide-react"

function cutoff24h() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000)
}

async function checkDatabase(): Promise<{ ok: boolean; latencyMs: number | null }> {
  const t0 = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, latencyMs: Date.now() - t0 }
  } catch {
    return { ok: false, latencyMs: null }
  }
}

export default async function PlatformOpsPage() {
  const [
    dbCheck,
    auditCount24h,
    userActiveCount,
    academyCount,
    lastAuditEvent,
    lastWebhookEvent,
    lastCronEvent,
    pendingPayoutBatches,
  ] = await Promise.all([
    checkDatabase(),
    prisma.auditLog.count({ where: { createdAt: { gt: cutoff24h() } } }),
    prisma.user.count({ where: { isActive: true } }),
    prisma.academy.count({ where: { isActive: true } }),
    prisma.auditLog.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, action: true },
    }),
    prisma.auditLog.findFirst({
      where: { action: "purchase.finalize" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, action: true },
    }),
    prisma.auditLog.findFirst({
      where: {
        action: {
          in: [
            "ledger.invariant_check",
            "ledger.invariant_violation",
            "reminder.enqueue",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, action: true },
    }),
    prisma.payoutBatch.count({
      where: { status: { in: ["DRAFT", "APPROVED"] } },
    }),
  ])

  const integrations = integrationStatus()

  // Detect Stripe mode without leaking the secret. Stripe test keys start
  // with sk_test_ and live keys with sk_live_.
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? ""
  const stripeMode = stripeKey.startsWith("sk_live_")
    ? "live"
    : stripeKey.startsWith("sk_test_")
    ? "test"
    : null

  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Operations</h1>
        <p className="text-muted-foreground mt-1">
          Spec §7. Infrastructure-only view — uptime, security, backups,
          performance, payment gateway. No business or learner data is
          displayed or editable here.
        </p>
      </div>

      {/* Top metrics */}
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

      {/* Live service checks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Service status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <StatusRow
            icon={Database}
            service="Postgres (live ping)"
            ok={dbCheck.ok}
            detail={dbCheck.latencyMs !== null ? `${dbCheck.latencyMs}ms` : "no response"}
          />
          <StatusRow icon={Shield} service="Auth (NextAuth)" ok={integrations.auth} />
          <StatusRow
            icon={CreditCard}
            service="Stripe"
            ok={integrations.stripe}
            detail={stripeMode ? `mode: ${stripeMode}` : "not configured"}
          />
          <StatusRow
            icon={Cloud}
            service="Cloudinary"
            ok={integrations.cloudinary}
            detail={
              integrations.cloudinary
                ? `cloud: ${process.env.CLOUDINARY_CLOUD_NAME ?? "—"}`
                : "no API key"
            }
          />
          <StatusRow
            icon={Mail}
            service="Resend (email)"
            ok={integrations.email}
            detail={integrations.email ? "configured" : "no API key"}
          />
          <StatusRow
            icon={Sparkles}
            service="OpenAI (AI Assist)"
            ok={integrations.openai}
            detail="optional"
          />
          <StatusRow
            icon={Lock}
            service="Credential encryption"
            ok={integrations.credential_encryption}
            detail="AES-256-GCM key set"
          />
          <StatusRow
            icon={Lock}
            service="Cron auth"
            ok={integrations.cron_auth}
            detail={integrations.cron_auth ? "secret set" : "CRON_SECRET missing"}
          />
        </CardContent>
      </Card>

      {/* Payment gateway */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Payment gateway
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <KeyValue
            label="Stripe mode"
            value={
              stripeMode === "live" ? (
                <Badge className="bg-green-600 hover:bg-green-600">Live</Badge>
              ) : stripeMode === "test" ? (
                <Badge variant="secondary">Test</Badge>
              ) : (
                <Badge variant="destructive">Not configured</Badge>
              )
            }
          />
          <KeyValue
            icon={Webhook}
            label="Last webhook event"
            value={
              lastWebhookEvent
                ? new Date(lastWebhookEvent.createdAt).toLocaleString()
                : "Never"
            }
          />
          <KeyValue
            label="Pending payout batches"
            value={pendingPayoutBatches}
            hint="DRAFT or APPROVED, not yet PAID"
          />
        </CardContent>
      </Card>

      {/* Cron status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scheduled jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <KeyValue
            label="Last cron audit event"
            value={
              lastCronEvent
                ? `${lastCronEvent.action} • ${new Date(lastCronEvent.createdAt).toLocaleString()}`
                : "No cron events recorded"
            }
          />
          <p className="text-xs text-muted-foreground">
            Cron endpoints:{" "}
            <code className="font-mono">/api/cron/ledger-invariant</code>,{" "}
            <code className="font-mono">/api/cron/access-reminders</code>.
            Configure your scheduler to invoke these daily with the
            <code className="font-mono mx-1">CRON_SECRET</code>
            bearer token.
          </p>
        </CardContent>
      </Card>

      {/* Backup / scaling notes */}
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Backups & scaling</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong className="text-foreground">Database backups:</strong>{" "}
            Postgres runs as a Coolify-managed container on the Hostinger VPS.
            Enable scheduled backups (Coolify → Database → Backups) and
            verify the retention and off-site destination there.
          </p>
          <p>
            <strong className="text-foreground">Media backups:</strong>{" "}
            Cloudinary stores all signed-upload assets durably. A delete
            requires explicit API call.
          </p>
          <p>
            <strong className="text-foreground">Scaling:</strong>{" "}
            Next.js runs as a single Docker container behind Traefik. Prisma
            manages its own connection pool. For high-traffic events raise
            the container&apos;s CPU/memory limits in Coolify or add a
            second replica behind the same domain.
          </p>
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit & earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Link
            href="/platform/ops/audit"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent"
          >
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span>Operations audit log</span>
          </Link>
          <Link
            href="/platform/ops/earnings"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent"
          >
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span>Platform Support earnings (read-only)</span>
          </Link>
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
        <div className="min-w-0">
          <div className="text-2xl font-bold truncate">{value}</div>
          <div className="text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  icon: Icon,
  service,
  ok,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>
  service: string
  ok: boolean
  detail?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{service}</span>
        {detail && (
          <span className="text-xs text-muted-foreground">({detail})</span>
        )}
      </div>
      {ok ? (
        <Badge className="bg-green-600 hover:bg-green-600">Operational</Badge>
      ) : (
        <Badge variant="destructive">Not configured</Badge>
      )}
    </div>
  )
}

function KeyValue({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  hint?: string
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        <span>{label}</span>
      </div>
      <div className="text-sm font-medium">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  )
}
