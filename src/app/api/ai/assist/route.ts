import { NextResponse } from "next/server"
import { z } from "zod"
import type { Session } from "next-auth"
import { AiCapability } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { runAiAssist } from "@/lib/ai/assist"

/**
 * Phase 7 — Spec §8.1 AI Assist endpoint.
 *
 * A single POST /api/ai/assist handles all six capabilities (OUTLINE,
 * OBJECTIVES, VOICE_OVER, QUIZ, METADATA, SUMMARISE). Consolidated from
 * the plan's six separate URLs because every route's logic is identical —
 * auth → academy gate → runAiAssist → response. The capability lives in
 * the body instead of the URL.
 *
 * The caller must be a Course Developer, Academy Admin, or Platform Owner
 * for the target academy. Every call writes an AiInteraction row and an
 * audit entry regardless of model outcome.
 */

const schema = z.object({
  capability: z.enum([
    "OUTLINE",
    "OBJECTIVES",
    "VOICE_OVER",
    "QUIZ",
    "METADATA",
    "SUMMARISE",
  ]),
  academyId: z.string().min(1),
  userPrompt: z.string().min(1).max(20_000),
  context: z.record(z.string(), z.unknown()).optional(),
  maxTokens: z.number().int().min(256).max(8192).optional(),
})

async function assertAcademyAuthor(
  session: Session | null,
  academyId: string
) {
  if (!session?.user) return { ok: false as const, status: 401, error: "Unauthorized" }
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const allowedRoles = new Set(["ACADEMY_ADMIN", "COURSE_DEVELOPER"])
  const isMember = session.user.memberships?.some(
    (m) => m.academyId === academyId && allowedRoles.has(m.role)
  )
  if (!isOwner && !isMember) return { ok: false as const, status: 403, error: "Forbidden" }
  return { ok: true as const }
}

export async function POST(request: Request) {
  const session = await auth()
  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }
  const input = parsed.data

  const authz = await assertAcademyAuthor(session, input.academyId)
  if (!authz.ok) return NextResponse.json({ error: authz.error }, { status: authz.status })

  // Verify the academy row actually exists — so we return 404 (not 500) for
  // a bogus academyId even though the permission check passed structurally.
  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { id: true },
  })
  if (!academy) return NextResponse.json({ error: "Academy not found" }, { status: 404 })

  try {
    const result = await runAiAssist({
      capability: input.capability as AiCapability,
      academyId: input.academyId,
      userId: session!.user.id,
      userPrompt: input.userPrompt,
      context: input.context,
      maxTokens: input.maxTokens,
    })
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI assist failed"
    // AI disabled / missing API key → 409 (caller action required). Other
    // errors → 500.
    const status =
      msg.includes("disabled for this academy") ||
      msg.includes("ANTHROPIC_API_KEY not set")
        ? 409
        : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
