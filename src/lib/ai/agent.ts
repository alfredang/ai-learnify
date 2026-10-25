import { resolveAiCredentials } from "@/lib/ai/agent-auth"
import {
  completeWith,
  describeCredential,
  type LlmUsage,
} from "@/lib/ai/providers"

/**
 * Phase 7 — single chokepoint for model calls (Spec §8).
 *
 * Every AI authoring capability ultimately invokes `runAgentQuery()`,
 * which:
 *   1. Resolves the credential chain for the tenant
 *      (academy OpenAI credential → env OpenAI → env DeepSeek).
 *   2. Calls each provider in order until one succeeds. OpenAI
 *      (`gpt-6.1-sol` by default) is primary; DeepSeek V4.1 Flash is the
 *      fallback when OpenAI is missing, rate-limited or errors.
 *   3. Returns `{ rawText, usage }` for the caller to JSON-parse.
 *
 * Author IP & no-training: both OpenAI's API terms and DeepSeek's API
 * terms exclude customer prompts from model training by default. Drafts
 * produced here remain the author's IP — we persist them only on the
 * academy's own row in `AiInteraction`.
 */

export type AgentUsage = LlmUsage & {
  provider: "openai" | "deepseek" | "mock"
}

export type RunAgentQueryInput = {
  academyId: string
  systemPrompt: string
  userPrompt: string
  /** Override the default model for the primary provider. */
  model?: string
  /** Kept for API compatibility with older callers; single-turn only. */
  maxTurns?: number
  maxOutputTokens?: number
  /** Caller-supplied AbortController for cancellation. */
  abortController?: AbortController
}

export type RunAgentQueryResult = {
  rawText: string
  usage: AgentUsage
}

/**
 * Lenient JSON extraction:
 *   - strips ```json … ``` fences
 *   - falls back to the first {...} block when the model wraps in prose
 * Returns `null` if no parseable object was found.
 */
export function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fence ? fence[1] : trimmed
  try {
    return JSON.parse(candidate)
  } catch {
    const obj = candidate.match(/\{[\s\S]*\}/)
    if (!obj) return null
    try {
      return JSON.parse(obj[0])
    } catch {
      return null
    }
  }
}

export async function runAgentQuery(
  input: RunAgentQueryInput
): Promise<RunAgentQueryResult> {
  const chain = await resolveAiCredentials(input.academyId)
  const failures: string[] = []

  for (const { credential, source } of chain) {
    try {
      const result = await completeWith(credential, {
        system: input.systemPrompt,
        user: input.userPrompt,
        model: input.model,
        maxOutputTokens: input.maxOutputTokens,
        abortSignal: input.abortController?.signal,
      })
      if (!result.text.trim()) {
        failures.push(`${describeCredential(credential)}: empty response`)
        continue
      }
      return {
        rawText: result.text.trim(),
        usage: { ...result.usage, provider: result.provider },
      }
    } catch (e) {
      if (input.abortController?.signal.aborted) throw e
      const msg = e instanceof Error ? e.message : String(e)
      console.warn("[ai.agent] provider failed, trying next", {
        provider: describeCredential(credential),
        source,
        reason: msg.slice(0, 200),
      })
      failures.push(`${describeCredential(credential)}: ${msg.slice(0, 200)}`)
    }
  }

  throw new Error(`AI run failed: ${failures.join(" | ")}`)
}
