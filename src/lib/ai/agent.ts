import { query } from "@anthropic-ai/claude-agent-sdk"
import { buildClaudeEnv, loadAcademyClaudeToken } from "@/lib/ai/agent-auth"

/**
 * Phase 7 — single chokepoint for Claude Agent SDK calls (Spec §8).
 *
 * Every AI authoring capability ultimately invokes `runAgentQuery()`,
 * which:
 *   1. Resolves the per-tenant Claude credential (Academy.aiClaudeToken*
 *      → encrypted; falls back to ANTHROPIC_API_KEY env).
 *   2. Builds the subprocess env record (sk-ant-oat… → OAuth flow,
 *      otherwise API key).
 *   3. Streams messages from `query()`, accumulating assistant text
 *      and the result-message usage block.
 *   4. Returns `{ rawText, usage }` for the caller to JSON-parse.
 *
 * Author IP & no-training: both CLAUDE_CODE_OAUTH_TOKEN (Claude.ai
 * subscription) and ANTHROPIC_API_KEY (Console API) are governed by
 * Anthropic's Commercial Terms which exclude using customer prompts
 * for model training. Drafts produced here remain the author's IP —
 * we persist them only on the academy's own row in `AiInteraction`.
 */

export type AgentUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  model: string
  /** Total cost in USD as reported by the SDK result message. */
  costUsd: number
}

export type RunAgentQueryInput = {
  academyId: string
  systemPrompt: string
  userPrompt: string
  /** Tools to permit the model to call. Default: empty (single-turn JSON draft). */
  allowedTools?: string[]
  /** Built-in tool selection. Defaults to "no built-in tools" so we can run with a token that lacks WebSearch entitlement. */
  tools?: string[] | { type: "preset"; preset: "claude_code" }
  /** Default 1 — single round-trip drafts. Bump for multi-step agents. */
  maxTurns?: number
  /** Override the default model. */
  model?: string
  /** Caller-supplied AbortController for cancellation. */
  abortController?: AbortController
}

export type RunAgentQueryResult = {
  rawText: string
  usage: AgentUsage
}

const MODEL_DEFAULT = "claude-opus-4-7"

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
  const { token } = await loadAcademyClaudeToken(input.academyId)

  let rawText = ""
  let inputTokens = 0
  let outputTokens = 0
  let cachedTokens = 0
  let costUsd = 0
  let modelUsed = input.model ?? MODEL_DEFAULT

  for await (const message of query({
    prompt: input.userPrompt,
    options: {
      systemPrompt: input.systemPrompt,
      env: buildClaudeEnv(token),
      // Default to no built-in tools so the model produces a JSON draft
      // immediately — most authoring capabilities don't need filesystem
      // or web access. Capabilities that *do* (e.g. media curation)
      // pass `allowedTools`/`tools` explicitly.
      allowedTools: input.allowedTools ?? [],
      tools: input.tools ?? [],
      maxTurns: input.maxTurns ?? 1,
      model: input.model ?? MODEL_DEFAULT,
      // Subprocess sessions: don't write transcripts to ~/.claude/. The
      // tenant-scoped `AiInteraction` row IS the audit record we want.
      persistSession: false,
      abortController: input.abortController,
    },
  })) {
    if (message.type === "assistant") {
      const blocks = message.message?.content ?? []
      for (const b of blocks) {
        if (b.type === "text" && typeof b.text === "string") {
          rawText += b.text
        }
      }
    } else if (message.type === "result") {
      // Subtype "success" or "error_*" — both expose usage.
      const u = message.usage
      if (u) {
        // The SDK exposes Anthropic SDK usage shape (input_tokens, output_tokens,
        // cache_read_input_tokens, cache_creation). The cache_creation field is
        // a structured object rather than a number, so cast through unknown.
        const ut = u as unknown as {
          input_tokens?: number
          output_tokens?: number
          cache_read_input_tokens?: number
        }
        inputTokens = ut.input_tokens ?? 0
        outputTokens = ut.output_tokens ?? 0
        cachedTokens = ut.cache_read_input_tokens ?? 0
      }
      if (typeof message.total_cost_usd === "number") {
        costUsd = message.total_cost_usd
      }
      // Result message also confirms the model that ran.
      const mu = message.modelUsage ?? {}
      const firstModel = Object.keys(mu)[0]
      if (firstModel) modelUsed = firstModel
      // If the run errored, surface the API error so the caller can show it.
      if (message.subtype !== "success") {
        const reason =
          (message as { result?: string }).result ??
          message.subtype ??
          "AI run failed"
        if (!rawText.trim()) {
          throw new Error(`AI run failed: ${reason}`)
        }
      }
    }
  }

  return {
    rawText: rawText.trim(),
    usage: {
      inputTokens,
      outputTokens,
      cachedTokens,
      model: modelUsed,
      costUsd,
    },
  }
}
