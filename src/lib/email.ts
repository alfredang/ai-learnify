import { audit } from "@/lib/audit"

/**
 * Spec §10.2 / §11.2 — transactional email via Resend.
 *
 * Uses Resend's HTTP API directly (no SDK install) so this stays a single
 * dependency-free module. Degrades gracefully when credentials aren't
 * configured — every attempt is audited so you can see what *would* have
 * been sent in dev.
 *
 * Env vars:
 *   RESEND_API_KEY   — https://resend.com/api-keys
 *   EMAIL_FROM       — verified sender, e.g. "Learnify <no-reply@yours.com>"
 */

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Optional PDF / file attachments; kept simple for invoice emails. */
  attachments?: Array<{ filename: string; content: string /* base64 */ }>
  /** Logical purpose — used for audit metadata + category header. */
  purpose:
    | "invoice"
    | "reminder.end_m1"
    | "reminder.end_m2"
    | "reminder.pre_expiry"
    | "certificate"
    | "generic"
  /** Free-form audit context (courseId, userId, etc.). */
  context?: Record<string, unknown>
}

export type SendEmailResult = {
  ok: boolean
  providerId?: string
  skipped?: boolean
  reason?: string
}

const RESEND_ENDPOINT = "https://api.resend.com/emails"

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  // Quiet no-op when email isn't configured — common in dev. We still
  // audit so the intent is visible.
  if (!apiKey || !from) {
    await audit({
      action: "email.skip",
      resourceType: "email",
      metadata: {
        purpose: input.purpose,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        reason: !apiKey ? "RESEND_API_KEY missing" : "EMAIL_FROM missing",
        ...(input.context ?? {}),
      },
    })
    return { ok: false, skipped: true, reason: "email not configured" }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
        headers: {
          "X-Learnify-Purpose": input.purpose,
        },
        tags: [{ name: "purpose", value: input.purpose }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      await audit({
        action: "email.error",
        resourceType: "email",
        metadata: {
          purpose: input.purpose,
          status: res.status,
          providerError: errText.slice(0, 500),
          ...(input.context ?? {}),
        },
      })
      return { ok: false, reason: `resend http ${res.status}` }
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }

    await audit({
      action: "email.send",
      resourceType: "email",
      resourceId: data.id ?? null,
      metadata: {
        purpose: input.purpose,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        ...(input.context ?? {}),
      },
    })

    return { ok: true, providerId: data.id }
  } catch (err) {
    console.error("[email] send failed", err)
    await audit({
      action: "email.error",
      resourceType: "email",
      metadata: {
        purpose: input.purpose,
        error: err instanceof Error ? err.message : String(err),
        ...(input.context ?? {}),
      },
    })
    return { ok: false, reason: err instanceof Error ? err.message : "unknown" }
  }
}
