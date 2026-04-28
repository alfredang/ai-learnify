import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { encryptString, tokenLast4 } from "@/lib/encryption"

export const runtime = "nodejs"

/**
 * Phase 7 — Academy Admin Claude credential management.
 *
 *   GET    — returns { configured, last4, setAt, setBy } (never the
 *            plaintext token)
 *   POST   — accepts { token } in the body, encrypts with AES-256-GCM,
 *            stores cipher/iv/tag/last4/setAt/setBy on the Academy row,
 *            and writes an audit row
 *   DELETE — clears the cipher columns and writes an audit row
 *
 * Auth: ACADEMY_ADMIN on the academy or PLATFORM_OWNER. The endpoint is
 * always tenant-scoped — admins of academy A cannot affect academy B.
 *
 * Spec §8.3 governance: this endpoint is the only place a Claude token
 * crosses the tenant boundary. Tokens are NEVER returned in responses,
 * NEVER written to audit metadata, and NEVER logged. The encryption key
 * is held server-side only (CREDENTIAL_ENCRYPTION_KEY env var).
 */

const setSchema = z.object({
  token: z
    .string()
    .min(20, "Token looks too short — paste the full sk-ant-… token")
    .max(500),
})

async function resolveAcademyId(
  userId: string,
  platformRole: string | null,
  preferred?: string | null
): Promise<string | null> {
  if (preferred) {
    if (platformRole === "PLATFORM_OWNER") return preferred
    const m = await prisma.academyMembership.findFirst({
      where: { userId, academyId: preferred, role: "ACADEMY_ADMIN" },
      select: { academyId: true },
    })
    return m?.academyId ?? null
  }
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

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(request.url)
  const preferred = url.searchParams.get("academyId")
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? null,
    preferred
  )
  if (!academyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      aiClaudeTokenCipher: true,
      aiClaudeTokenLast4: true,
      aiClaudeTokenSetAt: true,
      aiClaudeTokenSetBy: true,
      aiEnabled: true,
    },
  })
  if (!academy) {
    return NextResponse.json({ error: "Academy not found" }, { status: 404 })
  }
  return NextResponse.json({
    academyId,
    configured: Boolean(academy.aiClaudeTokenCipher),
    last4: academy.aiClaudeTokenLast4 ?? null,
    setAt: academy.aiClaudeTokenSetAt
      ? academy.aiClaudeTokenSetAt.toISOString()
      : null,
    setBy: academy.aiClaudeTokenSetBy ?? null,
    aiEnabled: academy.aiEnabled,
  })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = (await request.json().catch(() => null)) as {
    token?: string
    academyId?: string
  } | null
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? null,
    body.academyId ?? null
  )
  if (!academyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = setSchema.safeParse({ token: body.token })
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const trimmed = parsed.data.token.trim()
  if (
    !trimmed.startsWith("sk-ant-") &&
    !trimmed.startsWith("sk-ant-oat") &&
    !trimmed.startsWith("sk-ant-api")
  ) {
    return NextResponse.json(
      {
        error:
          "Token must start with sk-ant-… (Console API key) or sk-ant-oat… (Claude.ai OAuth).",
      },
      { status: 400 }
    )
  }

  let enc
  try {
    enc = encryptString(trimmed)
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Encryption key not configured. Set CREDENTIAL_ENCRYPTION_KEY in .env.",
      },
      { status: 500 }
    )
  }

  await prisma.academy.update({
    where: { id: academyId },
    data: {
      aiClaudeTokenCipher: enc.cipher,
      aiClaudeTokenIv: enc.iv,
      aiClaudeTokenTag: enc.tag,
      aiClaudeTokenLast4: tokenLast4(trimmed),
      aiClaudeTokenSetAt: new Date(),
      aiClaudeTokenSetBy: session.user.id,
    },
  })

  await audit({
    action: "academy.credentials.claude.set",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent"),
    // last4 is ok in audit metadata; the full token is NOT.
    metadata: { last4: tokenLast4(trimmed) },
  })

  return NextResponse.json({ ok: true, last4: tokenLast4(trimmed) })
}

export async function DELETE(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const url = new URL(request.url)
  const preferred = url.searchParams.get("academyId")
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? null,
    preferred
  )
  if (!academyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  await prisma.academy.update({
    where: { id: academyId },
    data: {
      aiClaudeTokenCipher: null,
      aiClaudeTokenIv: null,
      aiClaudeTokenTag: null,
      aiClaudeTokenLast4: null,
      aiClaudeTokenSetAt: null,
      aiClaudeTokenSetBy: null,
    },
  })
  await audit({
    action: "academy.credentials.claude.clear",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent"),
  })
  return NextResponse.json({ ok: true })
}
