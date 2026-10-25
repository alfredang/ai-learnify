/**
 * LLM provider adapters — OpenAI (primary) and DeepSeek (fallback).
 *
 * Both providers are reached over plain HTTPS with `fetch` so the app has
 * no vendor SDK and no subprocess. Every adapter exposes the same shape:
 *
 *   complete({ system, user, model }) → { text, usage }
 *
 * OpenAI supports two credential kinds:
 *   - API key (`sk-…`)           → https://api.openai.com/v1/responses
 *   - ChatGPT OAuth (Codex login) → https://chatgpt.com/backend-api/codex/responses
 *     The OAuth backend only speaks server-sent events, so we stream and
 *     reassemble the final `response.completed` event. Expired access
 *     tokens are refreshed in-process when a refresh token is available.
 *
 * DeepSeek is OpenAI-compatible (chat/completions) and is used as the
 * fallback when OpenAI is unavailable, unconfigured, or errors.
 */

export type LlmUsage = {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  model: string
  /** USD cost when the provider reports one; otherwise 0. */
  costUsd: number
}

export type LlmResult = {
  text: string
  usage: LlmUsage
  provider: "openai" | "deepseek"
}

export type CompleteInput = {
  system: string
  user: string
  model?: string
  maxOutputTokens?: number
  abortSignal?: AbortSignal
}

export type OpenAiApiKeyCredential = {
  provider: "openai"
  kind: "api_key"
  token: string
}

export type OpenAiOAuthCredential = {
  provider: "openai"
  kind: "oauth"
  accessToken: string
  refreshToken?: string
  accountId: string
}

export type DeepSeekCredential = {
  provider: "deepseek"
  token: string
  baseUrl?: string
}

export type AiCredential =
  | OpenAiApiKeyCredential
  | OpenAiOAuthCredential
  | DeepSeekCredential

export const OPENAI_MODEL_DEFAULT = process.env.OPENAI_MODEL || "gpt-6.1-sol"
export const DEEPSEEK_MODEL_DEFAULT = process.env.DEEPSEEK_MODEL || "deepseek-flash"

const OPENAI_API_URL = "https://api.openai.com/v1/responses"
const CHATGPT_CODEX_URL = "https://chatgpt.com/backend-api/codex/responses"
const OPENAI_OAUTH_TOKEN_URL = "https://auth.openai.com/oauth/token"
// Public client id used by the OpenAI Codex CLI's device/browser login.
const OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann"
const REQUEST_TIMEOUT_MS = 120_000

export class LlmProviderError extends Error {
  constructor(
    public provider: AiCredential["provider"],
    message: string,
    public status?: number
  ) {
    super(`[${provider}] ${message}`)
    this.name = "LlmProviderError"
  }
}

/* ------------------------------------------------------------------ */
/*  OAuth helpers                                                      */
/* ------------------------------------------------------------------ */

/** Decode a JWT payload without verifying — we only read our own claims. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".")
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/** ChatGPT access tokens carry the account id under a namespaced claim. */
export function accountIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayload(token)
  const auth = payload?.["https://api.openai.com/auth"] as
    | { chatgpt_account_id?: string }
    | undefined
  return auth?.chatgpt_account_id ?? null
}

function isJwtExpired(token: string, skewSeconds = 60): boolean {
  const payload = decodeJwtPayload(token)
  const exp = typeof payload?.exp === "number" ? payload.exp : null
  if (!exp) return false
  return Date.now() / 1000 > exp - skewSeconds
}

// In-process cache so a refreshed token is reused across requests until
// it expires again. Keyed by refresh token.
const refreshedTokens = new Map<string, { accessToken: string; refreshToken: string }>()

async function refreshOAuth(cred: OpenAiOAuthCredential): Promise<OpenAiOAuthCredential> {
  if (!cred.refreshToken) {
    throw new LlmProviderError("openai", "OAuth access token expired and no refresh token is available", 401)
  }
  const cached = refreshedTokens.get(cred.refreshToken)
  if (cached && !isJwtExpired(cached.accessToken)) {
    return { ...cred, accessToken: cached.accessToken, refreshToken: cached.refreshToken }
  }
  const res = await fetch(OPENAI_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: OPENAI_OAUTH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: cred.refreshToken,
      scope: "openid profile email",
    }),
  })
  if (!res.ok) {
    throw new LlmProviderError("openai", `OAuth refresh failed (${res.status})`, res.status)
  }
  const data = (await res.json()) as { access_token?: string; refresh_token?: string }
  if (!data.access_token) {
    throw new LlmProviderError("openai", "OAuth refresh returned no access token")
  }
  const next = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? cred.refreshToken,
  }
  refreshedTokens.set(cred.refreshToken, next)
  return { ...cred, ...next }
}

/* ------------------------------------------------------------------ */
/*  Responses API (shared by API-key and OAuth paths)                  */
/* ------------------------------------------------------------------ */

type ResponsesOutput = {
  model?: string
  output?: Array<{
    type: string
    content?: Array<{ type: string; text?: string }>
  }>
  usage?: {
    input_tokens?: number
    output_tokens?: number
    input_tokens_details?: { cached_tokens?: number }
  }
  error?: { message?: string }
}

function buildResponsesBody(input: CompleteInput, model: string, stream: boolean) {
  return {
    model,
    instructions: input.system,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: input.user }],
      },
    ],
    store: false,
    stream,
    ...(input.maxOutputTokens && !stream ? { max_output_tokens: input.maxOutputTokens } : {}),
  }
}

function textFromResponses(r: ResponsesOutput): string {
  const chunks: string[] = []
  for (const item of r.output ?? []) {
    if (item.type !== "message") continue
    for (const c of item.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text)
    }
  }
  return chunks.join("")
}

function usageFromResponses(r: ResponsesOutput, model: string): LlmUsage {
  return {
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
    cachedTokens: r.usage?.input_tokens_details?.cached_tokens ?? 0,
    model: r.model ?? model,
    costUsd: 0,
  }
}

function withTimeout(signal?: AbortSignal): AbortSignal {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(new Error("LLM request timed out")), REQUEST_TIMEOUT_MS)
  signal?.addEventListener("abort", () => ctrl.abort(signal.reason), { once: true })
  ctrl.signal.addEventListener("abort", () => clearTimeout(t), { once: true })
  return ctrl.signal
}

async function completeOpenAiApiKey(
  cred: OpenAiApiKeyCredential,
  input: CompleteInput
): Promise<LlmResult> {
  const model = input.model ?? OPENAI_MODEL_DEFAULT
  const res = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildResponsesBody(input, model, false)),
    signal: withTimeout(input.abortSignal),
  })
  const data = (await res.json().catch(() => ({}))) as ResponsesOutput
  if (!res.ok) {
    throw new LlmProviderError("openai", data.error?.message ?? `HTTP ${res.status}`, res.status)
  }
  return { text: textFromResponses(data), usage: usageFromResponses(data, model), provider: "openai" }
}

/** Parse an SSE body from the ChatGPT backend into the final response. */
async function readResponsesStream(res: Response): Promise<ResponsesOutput> {
  const reader = res.body?.getReader()
  if (!reader) throw new LlmProviderError("openai", "empty stream body")
  const decoder = new TextDecoder()
  let buffer = ""
  let completed: ResponsesOutput | null = null
  const deltas: string[] = []

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return
    const raw = line.slice(5).trim()
    if (!raw || raw === "[DONE]") return
    let evt: { type?: string; delta?: string; response?: ResponsesOutput; error?: { message?: string } }
    try {
      evt = JSON.parse(raw)
    } catch {
      return
    }
    if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
      deltas.push(evt.delta)
    } else if (evt.type === "response.completed" && evt.response) {
      completed = evt.response
    } else if (evt.type === "response.failed" || evt.type === "error") {
      throw new LlmProviderError(
        "openai",
        evt.error?.message ?? (evt.response as { error?: { message?: string } } | undefined)?.error?.message ?? "stream failed"
      )
    }
  }

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, idx).trimEnd()
      buffer = buffer.slice(idx + 1)
      handleLine(line)
    }
  }
  if (buffer.trim()) handleLine(buffer.trim())

  if (completed) return completed
  // No completion event — fall back to the accumulated deltas.
  return { output: [{ type: "message", content: [{ type: "output_text", text: deltas.join("") }] }] }
}

async function completeOpenAiOAuth(
  cred: OpenAiOAuthCredential,
  input: CompleteInput,
  retried = false
): Promise<LlmResult> {
  let active = cred
  if (isJwtExpired(active.accessToken)) active = await refreshOAuth(active)
  const model = input.model ?? OPENAI_MODEL_DEFAULT
  const res = await fetch(CHATGPT_CODEX_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${active.accessToken}`,
      "chatgpt-account-id": active.accountId,
      "Content-Type": "application/json",
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs",
      accept: "text/event-stream",
    },
    body: JSON.stringify(buildResponsesBody(input, model, true)),
    signal: withTimeout(input.abortSignal),
  })
  if (res.status === 401 && !retried && active.refreshToken) {
    const refreshed = await refreshOAuth({ ...active, accessToken: "" })
    return completeOpenAiOAuth(refreshed, input, true)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new LlmProviderError("openai", body.slice(0, 300) || `HTTP ${res.status}`, res.status)
  }
  const data = await readResponsesStream(res)
  return { text: textFromResponses(data), usage: usageFromResponses(data, model), provider: "openai" }
}

/* ------------------------------------------------------------------ */
/*  DeepSeek (OpenAI-compatible chat completions)                      */
/* ------------------------------------------------------------------ */

type ChatCompletion = {
  model?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    prompt_cache_hit_tokens?: number
  }
  error?: { message?: string }
}

async function completeDeepSeek(cred: DeepSeekCredential, input: CompleteInput): Promise<LlmResult> {
  const base = (cred.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "")
  const model = input.model && input.model.startsWith("deepseek") ? input.model : DEEPSEEK_MODEL_DEFAULT
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      stream: false,
      ...(input.maxOutputTokens ? { max_tokens: input.maxOutputTokens } : {}),
    }),
    signal: withTimeout(input.abortSignal),
  })
  const data = (await res.json().catch(() => ({}))) as ChatCompletion
  if (!res.ok) {
    throw new LlmProviderError("deepseek", data.error?.message ?? `HTTP ${res.status}`, res.status)
  }
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cachedTokens: data.usage?.prompt_cache_hit_tokens ?? 0,
      model: data.model ?? model,
      costUsd: 0,
    },
    provider: "deepseek",
  }
}

/* ------------------------------------------------------------------ */
/*  Dispatcher                                                         */
/* ------------------------------------------------------------------ */

export async function completeWith(cred: AiCredential, input: CompleteInput): Promise<LlmResult> {
  if (cred.provider === "deepseek") return completeDeepSeek(cred, input)
  if (cred.kind === "oauth") return completeOpenAiOAuth(cred, input)
  return completeOpenAiApiKey(cred, input)
}

/** Human-readable label for diagnostics (never includes the secret). */
export function describeCredential(cred: AiCredential): string {
  if (cred.provider === "deepseek") return "deepseek"
  return cred.kind === "oauth" ? "openai:oauth" : "openai:api_key"
}
