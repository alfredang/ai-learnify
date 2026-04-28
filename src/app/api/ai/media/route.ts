import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { gatherMediaCandidates } from "@/lib/ai/web-search"
import { runAgentQuery, tryParseJson } from "@/lib/ai/agent"
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Phase 7 / Spec §8.2 — licence-free media curation, Claude Agent SDK
 * edition.
 *
 * Pipeline:
 *   1. Gather candidates from licence-aware sources (Openverse +
 *      Wikimedia) using server-side fetch — works on any Claude
 *      credential because we don't rely on a WebSearch entitlement.
 *   2. Hand the candidate set to the Agent SDK with the MEDIA_CURATION
 *      prompt; the model ranks, deduplicates, drops anything without a
 *      clear licence, and shapes the output to match the Resource model.
 *   3. Audit log the search (no PII; counts only).
 *
 * Auth: same gate as /api/ai/assist — Course Developer / Academy Admin /
 * Platform Owner on the academy, with `aiEnabled` true. Returns 409 if
 * the academy hasn't enabled AI or has no Claude credential configured.
 */

const schema = z.object({
  academyId: z.string().min(1),
  query: z.string().min(2).max(200),
  kind: z.enum(["image", "audio"]).default("image"),
  license: z
    .enum([
      "all-cc",
      "commercial",
      "cc0",
      "pdm",
      "by",
      "by-sa",
      "by-nc",
      "by-nd",
      "by-nc-sa",
      "by-nc-nd",
    ])
    .default("all-cc"),
  pageSize: z.number().int().min(1).max(20).default(10),
})

type CurationOutput = {
  query: string
  results: Array<{
    providerId: string
    title: string
    url: string
    thumbnailUrl: string | null
    license: string
    licenseVersion?: string | null
    licenseUrl: string | null
    sourceUrl: string | null
    sourceProvider: string
    attribution: string | null
    creator: string | null
    creatorUrl: string | null
    rationale: string
  }>
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const input = parsed.data

  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { id: true, aiEnabled: true },
  })
  if (!academy) {
    return NextResponse.json({ error: "Academy not found" }, { status: 404 })
  }

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const allowedRoles = new Set(["ACADEMY_ADMIN", "COURSE_DEVELOPER"])
  const isMember = session.user.memberships?.some(
    (m) => m.academyId === input.academyId && allowedRoles.has(m.role)
  )
  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!academy.aiEnabled) {
    return NextResponse.json(
      {
        error:
          "AI Assist is disabled for this academy. Enable it in Academy Settings.",
      },
      { status: 409 }
    )
  }

  // 1) Source-side gather. Fail-soft: if both sources return zero, we
  //    skip the Agent SDK entirely and tell the caller.
  const candidates = await gatherMediaCandidates({
    query: input.query,
    kind: input.kind,
    pageSize: input.pageSize,
    license: input.license,
  })

  if (candidates.length === 0) {
    await audit({
      action: "ai.media.search",
      resourceType: "aiMedia",
      userId: session.user.id,
      academyId: input.academyId,
      metadata: {
        query: input.query,
        kind: input.kind,
        license: input.license,
        resultCount: 0,
        curated: false,
      },
    })
    return NextResponse.json({
      provider: "openverse+wikimedia",
      query: input.query,
      results: [],
      message:
        "No licence-free candidates found. Try a broader query or different licence filter.",
    })
  }

  // 2) Curate via Agent SDK. The user prompt is a JSON envelope —
  //    cheap to cache for repeat queries thanks to the system prompt
  //    prefix being identical per capability.
  const userPrompt = `Query: ${input.query}\nKind: ${input.kind}\nLicence filter: ${input.license}\n\nCandidates (JSON):\n${JSON.stringify(
    candidates,
    null,
    2
  )}\n\nRank, deduplicate and shape per the system prompt. Return ONLY the JSON object.`

  let curated: CurationOutput | null = null
  try {
    const { rawText } = await runAgentQuery({
      academyId: input.academyId,
      systemPrompt: SYSTEM_PROMPTS.MEDIA_CURATION,
      userPrompt,
      maxTurns: 1,
    })
    const parsedJson = tryParseJson(rawText)
    if (
      parsedJson &&
      typeof parsedJson === "object" &&
      Array.isArray((parsedJson as CurationOutput).results)
    ) {
      curated = parsedJson as CurationOutput
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Curation failed"
    const status = msg.includes("AI is not configured") ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }

  await audit({
    action: "ai.media.search",
    resourceType: "aiMedia",
    userId: session.user.id,
    academyId: input.academyId,
    metadata: {
      query: input.query,
      kind: input.kind,
      license: input.license,
      resultCount: curated?.results.length ?? 0,
      candidateCount: candidates.length,
      curated: Boolean(curated),
    },
  })

  // Fall-through: if the model returned no parseable JSON, return the
  // raw multi-source candidates so the UI still has something to show.
  return NextResponse.json({
    provider: "openverse+wikimedia",
    query: input.query,
    results: curated?.results ?? candidates,
    curated: Boolean(curated),
  })
}
