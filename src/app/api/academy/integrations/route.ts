import { NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import {
  encryptOrKeep,
  hasSecret,
  type StoredIntegrations,
} from "@/lib/email/integrations"

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

const gmailSchema = z.object({
  enabled: z.boolean(),
  clientId: z.string().max(200).optional().default(""),
  clientSecret: z.string().max(500).optional().default(""),
  refreshToken: z.string().max(2000).optional().default(""),
  fromEmail: z.string().email().or(z.literal("")).optional().default(""),
})

const smtpSchema = z.object({
  enabled: z.boolean(),
  host: z.string().max(200).optional().default(""),
  port: z.number().int().min(1).max(65535).optional().default(587),
  username: z.string().max(200).optional().default(""),
  password: z.string().max(500).optional().default(""),
  fromEmail: z.string().email().or(z.literal("")).optional().default(""),
  secure: z.boolean().optional().default(false),
})

const putSchema = z.object({
  gmail: gmailSchema.optional(),
  smtp: smtpSchema.optional(),
  activeProvider: z.enum(["gmail", "smtp"]).nullable().optional(),
})

/**
 * Build a client-safe view: secrets become "***" when set, "" when not.
 * Plaintext fields (clientId, host, etc.) come back as-is.
 */
function toClientView(stored: StoredIntegrations | null) {
  const g = stored?.gmail ?? {}
  const s = stored?.smtp ?? {}
  return {
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
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { integrations: true },
  })

  return NextResponse.json({
    integrations: toClientView(
      (academy?.integrations as StoredIntegrations | null) ?? null
    ),
  })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = putSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  // Merge with existing so we can patch one provider without wiping the
  // other and so a "***" placeholder doesn't overwrite a real secret.
  const existing = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { integrations: true },
  })
  const current = (existing?.integrations as StoredIntegrations | null) ?? {}
  const currGmail = current.gmail ?? {}
  const currSmtp = current.smtp ?? {}

  const next: StoredIntegrations = { ...current }

  try {
    if (parsed.data.gmail) {
      const g = parsed.data.gmail
      next.gmail = {
        enabled: g.enabled,
        clientId: g.clientId,
        clientSecret: encryptOrKeep(g.clientSecret, currGmail.clientSecret),
        refreshToken: encryptOrKeep(g.refreshToken, currGmail.refreshToken),
        fromEmail: g.fromEmail,
      }
    }

    if (parsed.data.smtp) {
      const s = parsed.data.smtp
      next.smtp = {
        enabled: s.enabled,
        host: s.host,
        port: s.port,
        username: s.username,
        password: encryptOrKeep(s.password, currSmtp.password),
        fromEmail: s.fromEmail,
        secure: s.secure,
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error && err.message.includes("CREDENTIAL_ENCRYPTION_KEY")
            ? "CREDENTIAL_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32` and add to .env, then restart the server."
            : "Failed to encrypt integration secrets",
        code: "ENCRYPTION_NOT_CONFIGURED",
      },
      { status: 500 }
    )
  }

  if (parsed.data.activeProvider !== undefined) {
    next.activeProvider = parsed.data.activeProvider
  }

  await prisma.academy.update({
    where: { id: academyId },
    data: { integrations: next as unknown as Prisma.InputJsonValue },
  })

  await audit({
    action: "academy.integrations.update",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    metadata: {
      providersTouched: [
        parsed.data.gmail ? "gmail" : null,
        parsed.data.smtp ? "smtp" : null,
      ].filter(Boolean),
      activeProvider: next.activeProvider ?? null,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ integrations: toClientView(next) })
}
