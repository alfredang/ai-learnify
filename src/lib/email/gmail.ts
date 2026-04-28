/**
 * Gmail send via OAuth2 refresh token + Gmail API users.messages.send.
 *
 * No googleapis SDK — fetch is sufficient. Flow:
 *   1. POST refresh_token to https://oauth2.googleapis.com/token to get an access_token
 *   2. Build a raw RFC 5322 message
 *   3. Base64url-encode it and POST to Gmail API
 *
 * Caller passes decrypted credentials. Refresh tokens last until revoked
 * by the user, so we don't bother caching access tokens between calls —
 * the email volume here is small.
 */

export type GmailConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  fromEmail: string
}

export type GmailAttachment = {
  filename: string
  /** base64-encoded content. */
  content: string
  contentType?: string
}

export type GmailSendInput = {
  config: GmailConfig
  to: string[]
  subject: string
  html: string
  text?: string
  attachments?: GmailAttachment[]
  headers?: Record<string, string>
}

export type GmailSendResult = {
  ok: boolean
  messageId?: string
  error?: string
}

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

async function getAccessToken(config: GmailConfig): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: "refresh_token",
  })

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`gmail token refresh failed: ${res.status} ${text}`)
  }

  const json = (await res.json()) as { access_token?: string; error?: string }
  if (!json.access_token) {
    throw new Error(`gmail token refresh: no access_token (${json.error ?? "unknown"})`)
  }
  return json.access_token
}

function base64Url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function encodeHeader(value: string): string {
  // RFC 2047 encoded-word for non-ASCII (subjects, names). Cheap path.
  if (/^[\x20-\x7E]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`
}

function buildRawMessage(input: GmailSendInput): string {
  const boundaryAlt = `=alt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const boundaryMixed = `=mix_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const hasAttachments = (input.attachments?.length ?? 0) > 0

  const baseHeaders: string[] = [
    `From: ${input.config.fromEmail}`,
    `To: ${input.to.join(", ")}`,
    `Subject: ${encodeHeader(input.subject)}`,
    `MIME-Version: 1.0`,
  ]
  for (const [k, v] of Object.entries(input.headers ?? {})) {
    baseHeaders.push(`${k}: ${v}`)
  }

  const altPart = [
    `Content-Type: multipart/alternative; boundary="${boundaryAlt}"`,
    ``,
    `--${boundaryAlt}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    input.text ?? stripHtml(input.html),
    ``,
    `--${boundaryAlt}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    ``,
    input.html,
    ``,
    `--${boundaryAlt}--`,
  ].join("\r\n")

  if (!hasAttachments) {
    return [...baseHeaders, ...altPart.split("\r\n")].join("\r\n")
  }

  const attachmentParts =
    input.attachments?.map((a) => {
      return [
        `--${boundaryMixed}`,
        `Content-Type: ${a.contentType ?? "application/octet-stream"}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        a.content,
      ].join("\r\n")
    }) ?? []

  return [
    ...baseHeaders,
    `Content-Type: multipart/mixed; boundary="${boundaryMixed}"`,
    ``,
    `--${boundaryMixed}`,
    altPart,
    ``,
    ...attachmentParts,
    ``,
    `--${boundaryMixed}--`,
  ].join("\r\n")
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

export async function sendViaGmail(
  input: GmailSendInput
): Promise<GmailSendResult> {
  const { config } = input
  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.fromEmail) {
    return { ok: false, error: "gmail credentials not fully configured" }
  }

  try {
    const accessToken = await getAccessToken(config)
    const raw = buildRawMessage(input)
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64Url(raw) }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, error: `gmail api ${res.status}: ${text.slice(0, 300)}` }
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, messageId: json.id }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
