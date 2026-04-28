import type { Metadata } from "next"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { hasSecret, type StoredIntegrations } from "@/lib/email/integrations"
import { IntegrationsForm, type IntegrationsValues } from "./integrations-form"
import { AiCredentialsForm } from "../settings/ai-credentials-form"

export const metadata: Metadata = {
  title: "Credentials · Academy Admin",
}

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

export default async function AcademyIntegrationsPage() {
  const session = await auth()
  if (!session?.user) return null

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) {
    return (
      <div className="container py-12 max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No academy for this account.
          </CardContent>
        </Card>
      </div>
    )
  }

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { integrations: true },
  })

  const stored = (academy?.integrations as StoredIntegrations | null) ?? null
  const g = stored?.gmail ?? {}
  const s = stored?.smtp ?? {}

  // Server-side decryption stays on the server. The form receives "***"
  // placeholders for already-stored secrets; saving with "***" keeps the
  // existing ciphertext untouched.
  const initial: IntegrationsValues = {
    gmail: {
      enabled: Boolean(g.enabled),
      clientId: g.clientId ?? "",
      clientSecret: hasSecret(g.clientSecret) ? "***" : "",
      refreshToken: hasSecret(g.refreshToken) ? "***" : "",
      fromEmail: g.fromEmail ?? "",
    },
    smtp: {
      enabled: Boolean(s.enabled),
      host: s.host ?? "",
      port: s.port ?? 587,
      username: s.username ?? "",
      password: hasSecret(s.password) ? "***" : "",
      fromEmail: s.fromEmail ?? "",
      secure: Boolean(s.secure),
    },
    activeProvider: stored?.activeProvider ?? null,
  }

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Credentials</h1>
        <p className="text-muted-foreground text-sm mt-1">
          API keys and secrets for this academy. All values are encrypted at
          rest with AES-256-GCM. Per-tenant overrides take precedence over
          platform-wide environment defaults.
        </p>
      </div>

      <Tabs defaultValue="ai">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <TabsList className="flex w-max">
            <TabsTrigger value="ai">Claude AI</TabsTrigger>
            <TabsTrigger value="email">Email (Gmail / SMTP)</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ai" className="mt-6">
          <AiCredentialsForm />
        </TabsContent>

        <TabsContent value="email" className="mt-6 space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure outbound email for transactional notifications,
            invoices, certificates and access reminders. Choose Gmail
            (OAuth2) or plain SMTP, then mark one as the active sender.
          </p>
          <IntegrationsForm initial={initial} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
