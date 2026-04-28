import { createHash } from "node:crypto"
import { AiCapability, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { SYSTEM_PROMPTS } from "@/lib/ai/prompts"
import { runAgentQuery, tryParseJson } from "@/lib/ai/agent"

/**
 * Phase 7 — central AI assist service (spec §8).
 *
 *   - All capabilities run through `runAgentQuery()` from
 *     `@anthropic-ai/claude-agent-sdk` so the same per-tenant Claude
 *     credential, audit trail, and chokepoint applies to every draft.
 *   - The single shared system prompt per capability stays stable across
 *     calls so the model's prompt cache (5-min TTL prefix match) keeps
 *     warm. Volatile content (course title, existing copy) is sent in the
 *     user turn after the cached prefix.
 *   - Every call writes an `AiInteraction` row + audit log entry.
 *   - Tenant gate: refuses if `academy.aiEnabled` is false.
 *   - Output is always a DRAFT — `approved=false` until the author hits
 *     "Use this draft" in the UI.
 */

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
  /** Override max conversation turns. Default 1 (single round-trip). */
  maxTurns?: number
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
    costUsd: number
  }
  approvalRequired: true
}

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 32)
}

/**
 * Core AI call. Reads the academy flag, runs the Agent SDK with a
 * cached system prompt + user turn, records the interaction, returns
 * a draft.
 */
export async function runAiAssist(
  input: AiAssistInput
): Promise<AiAssistResult> {
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
  if (!systemPrompt) {
    throw new Error(`No prompt registered for capability ${input.capability}`)
  }

  const { rawText, usage } = await runAgentQuery({
    academyId: input.academyId,
    systemPrompt,
    userPrompt: input.userPrompt,
    model: input.model,
    maxTurns: input.maxTurns ?? 1,
  })

  const parsed = tryParseJson(rawText)

  const promptHash = sha(
    `${input.capability}::${systemPrompt}::${input.userPrompt}`
  )
  const outputHash = sha(rawText)

  const interaction = await prisma.aiInteraction.create({
    data: {
      academyId: input.academyId,
      userId: input.userId,
      capability: input.capability,
      promptHash,
      outputHash,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      model: usage.model,
      contextJson:
        (input.context as Prisma.InputJsonValue | undefined) ?? undefined,
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
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: usage.costUsd,
    },
  })

  return {
    interactionId: interaction.id,
    capability: input.capability,
    rawText,
    parsed,
    usage,
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
    select: {
      id: true,
      academyId: true,
      approved: true,
      capability: true,
    },
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
