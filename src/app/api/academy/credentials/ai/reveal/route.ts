import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { decryptString } from "@/lib/encryption"

export const runtime = "nodejs"

/**
 * Phase 7 — one-shot reveal of the AI credential plaintext for the
 * academy admin who set it. POST (not GET) so the URL never lands in
 * proxy logs or browser history. Every successful call writes an
 * `academy.credentials.ai.reveal` audit row with userId, IP and UA;
 * the UI is expected to auto-mask the value after ~10 seconds so the
 * plaintext doesn't linger in the DOM.
 */

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

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    academyId?: string
    reason?: string
  }
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? null,
    body.academyId ?? null
  )
  if (!academyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      aiProviderTokenCipher: true,
      aiProviderTokenIv: true,
      aiProviderTokenTag: true,
      aiProviderTokenLast4: true,
    },
  })

  if (
    !academy?.aiProviderTokenCipher ||
    !academy.aiProviderTokenIv ||
    !academy.aiProviderTokenTag
  ) {
    return NextResponse.json(
      { error: "No credential configured for this academy" },
      { status: 404 }
    )
  }

  let plaintext: string
  try {
    plaintext = decryptString({
      cipher: academy.aiProviderTokenCipher,
      iv: academy.aiProviderTokenIv,
      tag: academy.aiProviderTokenTag,
    })
  } catch {
    return NextResponse.json(
      { error: "Decryption failed — credential may be corrupt" },
      { status: 500 }
    )
  }

  await audit({
    action: "academy.credentials.ai.reveal",
    resourceType: "academy",
    resourceId: academyId,
    userId: session.user.id,
    academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent"),
    metadata: {
      last4: academy.aiProviderTokenLast4 ?? null,
      reason: typeof body.reason === "string" ? body.reason.slice(0, 200) : null,
    },
  })

  return NextResponse.json({
    token: plaintext,
    last4: academy.aiProviderTokenLast4 ?? null,
    expiresInMs: 10_000,
  })
}
