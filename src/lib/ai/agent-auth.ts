import { prisma } from "@/lib/prisma"
import { decryptString } from "@/lib/encryption"
import {
  accountIdFromAccessToken,
  type AiCredential,
  type OpenAiApiKeyCredential,
  type OpenAiOAuthCredential,
} from "@/lib/ai/providers"

/**
 * Phase 7 — AI credential resolution.
 *
 * Builds the ordered list of credentials `runAgentQuery()` will try:
 *
 *   1. The academy's own OpenAI credential (encrypted on the Academy row,
 *      set by an Academy Admin in Settings → Integrations).
 *   2. The platform-wide OpenAI credential from env — either
 *      `OPENAI_API_KEY`, or a ChatGPT OAuth login via
 *      `OPENAI_OAUTH_ACCESS_TOKEN` (+ optional `OPENAI_OAUTH_REFRESH_TOKEN`
 *      and `OPENAI_ACCOUNT_ID`).
 *   3. DeepSeek (`DEEPSEEK_API_KEY`) as the fallback model.
 *
 * Spec §8.3 governance: tokens are never logged, never written to audit
 * metadata, and never returned from API routes. Decryption happens
 * server-side immediately before the provider call.
 */

export type ResolvedCredential = {
  credential: AiCredential
  /** Origin — useful for diagnostics, never user-visible. */
  source: "academy" | "env"
}

/**
 * Parse a pasted OpenAI credential string into a typed credential.
 * Accepts:
 *   - `sk-…` API keys
 *   - a raw ChatGPT OAuth access token (JWT, `eyJ…`)
 *   - a JSON object `{ access_token, refresh_token?, account_id? }` — the
 *     `tokens` block from the Codex CLI's auth.json
 */
export function parseOpenAiCredential(
  raw: string
): OpenAiApiKeyCredential | OpenAiOAuthCredential | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("sk-")) {
    return { provider: "openai", kind: "api_key", token: trimmed }
  }
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed) as {
        access_token?: string
        refresh_token?: string
        account_id?: string
      }
      if (obj.access_token) {
        const accountId = obj.account_id ?? accountIdFromAccessToken(obj.access_token)
        if (!accountId) return null
        return {
          provider: "openai",
          kind: "oauth",
          accessToken: obj.access_token,
          refreshToken: obj.refresh_token,
          accountId,
        }
      }
    } catch {
      return null
    }
    return null
  }
  if (trimmed.startsWith("eyJ")) {
    const accountId = accountIdFromAccessToken(trimmed)
    if (!accountId) return null
    return { provider: "openai", kind: "oauth", accessToken: trimmed, accountId }
  }
  return null
}

function envOpenAi(): OpenAiApiKeyCredential | OpenAiOAuthCredential | null {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (key) return { provider: "openai", kind: "api_key", token: key }
  const access = process.env.OPENAI_OAUTH_ACCESS_TOKEN?.trim()
  if (access) {
    const accountId =
      process.env.OPENAI_ACCOUNT_ID?.trim() || accountIdFromAccessToken(access)
    if (accountId) {
      return {
        provider: "openai",
        kind: "oauth",
        accessToken: access,
        refreshToken: process.env.OPENAI_OAUTH_REFRESH_TOKEN?.trim() || undefined,
        accountId,
      }
    }
  }
  return null
}

function envDeepSeek(): AiCredential | null {
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) return null
  return { provider: "deepseek", token: key, baseUrl: process.env.DEEPSEEK_BASE_URL }
}

/**
 * Resolve the credential chain for an academy. Throws when nothing is
 * configured so callers can return a clean 409 to the UI.
 */
export async function resolveAiCredentials(academyId: string): Promise<ResolvedCredential[]> {
  const chain: ResolvedCredential[] = []

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: {
      aiProviderTokenCipher: true,
      aiProviderTokenIv: true,
      aiProviderTokenTag: true,
    },
  })

  if (academy?.aiProviderTokenCipher && academy.aiProviderTokenIv && academy.aiProviderTokenTag) {
    try {
      const plain = decryptString({
        cipher: academy.aiProviderTokenCipher,
        iv: academy.aiProviderTokenIv,
        tag: academy.aiProviderTokenTag,
      })
      const cred = parseOpenAiCredential(plain)
      if (cred) chain.push({ credential: cred, source: "academy" })
    } catch (e) {
      // GCM auth-tag mismatch usually means CREDENTIAL_ENCRYPTION_KEY was
      // rotated after the token was stored. Log without exposing cipher
      // bytes and fall through to the env chain.
      console.error("[agent-auth] academy credential decrypt failed", {
        academyId,
        reason: e instanceof Error ? e.message : "unknown",
      })
    }
  }

  const openai = envOpenAi()
  if (openai) chain.push({ credential: openai, source: "env" })
  const deepseek = envDeepSeek()
  if (deepseek) chain.push({ credential: deepseek, source: "env" })

  if (chain.length === 0) {
    throw new Error(
      "AI is not configured for this academy. An Academy Admin can paste an OpenAI credential in Settings → Integrations, or the Platform Owner can set OPENAI_API_KEY / DEEPSEEK_API_KEY."
    )
  }
  return chain
}
