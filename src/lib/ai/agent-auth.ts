import { prisma } from "@/lib/prisma"
import { decryptString } from "@/lib/encryption"

/**
 * Phase 7 — Claude credentials & subprocess env builder.
 *
 * The Claude Agent SDK launches `claude-code` as a child process. This
 * module owns the auth boundary between our tenant store and that
 * subprocess: it decrypts the per-tenant token and shapes it into the
 * env vars the CLI looks for.
 *
 * Patterned on `lib/anthropic-auth.ts` from alfredang/AI-LMS-TMS, which
 * established the rule: `sk-ant-oat…` → `CLAUDE_CODE_OAUTH_TOKEN`,
 * everything else → `ANTHROPIC_API_KEY`. We strip the other auth env
 * vars before injecting our chosen one so a leaked-in `ANTHROPIC_API_KEY`
 * (e.g. from the deploy host) can't shadow the tenant token.
 *
 * Spec §8.3 governance: tokens are never logged, never sent to audit
 * metadata, and never returned from API routes. Reads only happen
 * server-side immediately before the SDK call.
 */

export type ResolvedClaudeToken = {
  token: string
  /** Origin of the token — useful for diagnostics, never user-visible. */
  source: "academy" | "env"
}

/**
 * Resolve the Claude token to use for an academy. Order:
 *   1. Encrypted token on the Academy row (set by Academy Admin via UI)
 *   2. ANTHROPIC_API_KEY env var (global fallback)
 *
 * Throws when neither is configured so callers can return a clean 409
 * to the UI instead of a cryptic CLI error.
 */
export async function loadAcademyClaudeToken(
  academyId: string
): Promise<ResolvedClaudeToken> {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      aiClaudeTokenCipher: true,
      aiClaudeTokenIv: true,
      aiClaudeTokenTag: true,
    },
  })

  if (
    academy?.aiClaudeTokenCipher &&
    academy.aiClaudeTokenIv &&
    academy.aiClaudeTokenTag
  ) {
    const token = decryptString({
      cipher: academy.aiClaudeTokenCipher,
      iv: academy.aiClaudeTokenIv,
      tag: academy.aiClaudeTokenTag,
    })
    return { token, source: "academy" }
  }

  const fallback = process.env.ANTHROPIC_API_KEY
  if (fallback && fallback.trim().length > 0) {
    return { token: fallback, source: "env" }
  }

  throw new Error(
    "AI is not configured for this academy. An Academy Admin can paste a Claude token in Settings, or the Platform Owner can set ANTHROPIC_API_KEY."
  )
}

/**
 * Build the env record for the Claude Agent SDK subprocess.
 *
 *   - `sk-ant-oat…` (Claude.ai subscription OAuth) → CLAUDE_CODE_OAUTH_TOKEN
 *   - anything else (Console API key)             → ANTHROPIC_API_KEY
 *
 * We always strip the other two auth vars from the inherited environment
 * so a stale value can't shadow the token we picked.
 */
export function buildClaudeEnv(
  token: string
): Record<string, string | undefined> {
  const trimmed = token.trim()
  const env: Record<string, string | undefined> = { ...process.env }
  delete env.ANTHROPIC_API_KEY
  delete env.ANTHROPIC_AUTH_TOKEN
  delete env.CLAUDE_CODE_OAUTH_TOKEN
  if (trimmed.startsWith("sk-ant-oat")) {
    env.CLAUDE_CODE_OAUTH_TOKEN = trimmed
  } else {
    env.ANTHROPIC_API_KEY = trimmed
  }
  // Identify ourselves in the User-Agent for support diagnostics.
  env.CLAUDE_AGENT_SDK_CLIENT_APP = "iesa-lms-authoring/1.0"
  return env
}
