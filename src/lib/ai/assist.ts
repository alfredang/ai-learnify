import Anthropic from "@anthropic-ai/sdk"
import { createHash } from "node:crypto"
import { AiCapability, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts"

/**
 * Phase 7 — central AI assist service (spec §8).
 *
 *   - Single shared Anthropic client (server-only).
 *   - Prompt caching on the capability system prompt (5-min TTL, prefix
 *     match). Volatile per-call content goes in the user turn after the
 *     cached prefix, so the cache stays warm across authoring sessions.
 *   - Every call writes an AiInteraction row so §8.3 audit is intact.
 *   - Tenant gate: refuses if academy.aiEnabled is false.
 *   - Output is always a DRAFT. Caller decides whether to approve.
 */

const MODEL_DEFAULT = "claude-opus-4-7"

let _client: Anthropic | null = null
function client(): Anthropic {
  if (_client) return _client
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY not set — add it to .env before using AI assist."
    )
  }
  _client = new Anthropic()
  return _client
}

export type AiAssistInput = {
  capability: AiCapability
  academyId: string
  userId: string
  /** Freeform per-capability input the author provides (topic, existing copy, slide context, etc.). */
  userPrompt: string
  /** Extra context recorded on the audit row — e.g. { courseId, lectureId }. */
  context?: Record<string, unknown>
  /** Override model (default claude-opus-4-7). */
  model?: string
  /** Override max_tokens (default 2048). */
  maxTokens?: number
}

export type AiAssistResult = {
  interactionId: string
  capability: AiCapability
  /** Raw text from the model — callers should JSON.parse per the prompt contract. */
  rawText: string
  /** Parsed JSON if the raw text was valid JSON; otherwise null. */
  parsed: unknown | null
  usage: {
    inputTokens: number
    outputTokens: number
    cachedTokens: number
    model: string
  }
  approvalRequired: true
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32)
}

function tryParseJson(s: string): unknown | null {
  // Tolerate models that occasionally wrap JSON in markdown fences.
  const trimmed = s.trim()
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
    : trimmed
  try {
    return JSON.parse(unfenced)
  } catch {
    return null
  }
}

/**
 * Core AI call. Reads the academy flag, sends a cached system prompt +
 * user turn, records the interaction, returns a draft.
 */
export async function runAiAssist(input: AiAssistInput): Promise<AiAssistResult> {
  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { aiEnabled: true, slug: true },
  })
  if (!academy) throw new Error("Academy not found")
  if (!academy.aiEnabled) {
    throw new Error(
      "AI Assist is disabled for this academy. An Academy Admin can enable it in Settings."
    )
  }

  const systemPrompt = SYSTEM_PROMPTS[input.capability]
  const model = input.model ?? MODEL_DEFAULT
  const maxTokens = input.maxTokens ?? 2048

  const response = await client().messages.create({
    model,
    max_tokens: maxTokens,
    // Cached system prompt — identical across calls for a given capability,
    // so subsequent authors writing against the same capability get cache
    // reads. `cache_control: ephemeral` ≈ 5-min TTL.
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input.userPrompt }],
    // Adaptive thinking — model decides how hard to think per call.
    thinking: { type: "adaptive" },
  })

  // Extract the first text block. Thinking blocks also appear; we drop them.
  const rawText = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim()

  const parsed = tryParseJson(rawText)

  const promptHash = sha(`${input.capability}::${systemPrompt}::${input.userPrompt}`)
  const outputHash = sha(rawText)

  const interaction = await prisma.aiInteraction.create({
    data: {
      academyId: input.academyId,
      userId: input.userId,
      capability: input.capability,
      promptHash,
      outputHash,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
      model,
      contextJson: (input.context as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  })

  await audit({
    action: "ai.assist",
    resourceType: "aiInteraction",
    resourceId: interaction.id,
    userId: input.userId,
    academyId: input.academyId,
    metadata: {
      capability: input.capability,
      model,
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  })

  return {
    interactionId: interaction.id,
    capability: input.capability,
    rawText,
    parsed,
    usage: {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cachedTokens: response.usage.cache_read_input_tokens ?? 0,
      model,
    },
    approvalRequired: true,
  }
}

/**
 * Mark a draft as author-approved. Per spec §8.1, only approved drafts
 * should be surfaced as canonical course content; unapproved rows stay
 * as audit history.
 */
export async function approveAiInteraction(
  interactionId: string,
  approverUserId: string
): Promise<void> {
  const interaction = await prisma.aiInteraction.findUnique({
    where: { id: interactionId },
    select: { id: true, academyId: true, approved: true, capability: true },
  })
  if (!interaction) throw new Error("Interaction not found")
  if (interaction.approved) return

  await prisma.aiInteraction.update({
    where: { id: interactionId },
    data: { approved: true, approvedAt: new Date() },
  })
  await audit({
    action: "ai.approve",
    resourceType: "aiInteraction",
    resourceId: interaction.id,
    userId: approverUserId,
    academyId: interaction.academyId,
    metadata: { capability: interaction.capability },
  })
}
