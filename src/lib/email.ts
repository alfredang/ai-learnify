import { audit } from "@/lib/audit"
import { resolveActiveProvider } from "@/lib/email/integrations"
import { sendViaGmail } from "@/lib/email/gmail"
import { sendViaSmtp } from "@/lib/email/smtp"

/**
 * Spec §10.2 / §11.2 — transactional email.
 *
 * Provider selection (in order):
 *   1. If academyId is passed and Academy.integrations has an active
 *      Gmail or SMTP provider → send through that (per-tenant).
 *   2. Else fall back to platform-default Resend (RESEND_API_KEY +
 *      EMAIL_FROM env vars).
 *   3. Else log + skip (dev-friendly no-op).
 *
 * Every attempt is audited so the pipeline is visible end-to-end even
 * when delivery is skipped.
 */

export type EmailPurpose =
  | "invoice"
  | "reminder.end_m1"
  | "reminder.end_m2"
  | "reminder.pre_expiry"
  | "certificate"
  | "email.change_verification"
  | "test"
  | "generic"

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Optional PDF / file attachments; kept simple for invoice emails. */
  attachments?: Array<{ filename: string; content: string /* base64 */ }>
  /** Logical purpose — used for audit metadata + category header. */
  purpose: EmailPurpose
  /** Free-form audit context (courseId, userId, etc.). */
  context?: Record<string, unknown>
  /** When set, prefer the academy's configured provider over Resend. */
  academyId?: string
}

export type SendEmailResult = {
  ok: boolean
  providerId?: string
  provider?: "gmail" | "smtp" | "resend" | "none"
  skipped?: boolean
  reason?: string
}

const RESEND_ENDPOINT = "https://api.resend.com/emails"

function toArray(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to]
}

async function sendViaResend(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM

  if (!apiKey || !from) {
    return { ok: false, skipped: true, reason: "resend not configured" }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: toArray(input.to),
        subject: input.subject,
        html: input.html,
        ...(input.text ? { text: input.text } : {}),
        ...(input.attachments && input.attachments.length > 0
          ? { attachments: input.attachments }
          : {}),
        headers: { "X-Learnify-Purpose": input.purpose },
        tags: [{ name: "purpose", value: input.purpose }],
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      return {
        ok: false,
        provider: "resend",
        reason: `resend http ${res.status}: ${errText.slice(0, 200)}`,
      }
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, provider: "resend", providerId: data.id }
  } catch (err) {
    return {
      ok: false,
      provider: "resend",
      reason: err instanceof Error ? err.message : "unknown",
    }
  }
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const recipients = toArray(input.to)
  const headers = { "X-Learnify-Purpose": input.purpose }

  // 1. Try the academy's configured provider, if any.
  if (input.academyId) {
    const resolved = await resolveActiveProvider(input.academyId)

    if (resolved.provider === "gmail") {
      const r = await sendViaGmail({
        config: resolved.config,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments,
        headers,
      })
      await audit({
        action: r.ok ? "email.send" : "email.error",
        resourceType: "email",
        resourceId: r.messageId ?? null,
        academyId: input.academyId,
        metadata: {
          provider: "gmail",
          purpose: input.purpose,
          to: recipients,
          subject: input.subject,
          ...(r.error ? { providerError: r.error } : {}),
          ...(input.context ?? {}),
        },
      })
      return r.ok
        ? { ok: true, provider: "gmail", providerId: r.messageId }
        : { ok: false, provider: "gmail", reason: r.error }
    }

    if (resolved.provider === "smtp") {
      const r = await sendViaSmtp({
        config: resolved.config,
        to: recipients,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: input.attachments,
        headers,
      })
      await audit({
        action: r.ok ? "email.send" : "email.error",
        resourceType: "email",
        resourceId: r.messageId ?? null,
        academyId: input.academyId,
        metadata: {
          provider: "smtp",
          purpose: input.purpose,
          to: recipients,
          subject: input.subject,
          ...(r.error ? { providerError: r.error } : {}),
          ...(input.context ?? {}),
        },
      })
      return r.ok
        ? { ok: true, provider: "smtp", providerId: r.messageId }
        : { ok: false, provider: "smtp", reason: r.error }
    }
  }

  // 2. Fall back to platform-default Resend.
  const resend = await sendViaResend(input)
  if (resend.skipped) {
    await audit({
      action: "email.skip",
      resourceType: "email",
      ...(input.academyId ? { academyId: input.academyId } : {}),
      metadata: {
        purpose: input.purpose,
        to: recipients,
        subject: input.subject,
        reason: resend.reason ?? "no provider configured",
        ...(input.context ?? {}),
      },
    })
    return { ok: false, provider: "none", skipped: true, reason: resend.reason }
  }

  await audit({
    action: resend.ok ? "email.send" : "email.error",
    resourceType: "email",
    resourceId: resend.providerId ?? null,
    ...(input.academyId ? { academyId: input.academyId } : {}),
    metadata: {
      provider: "resend",
      purpose: input.purpose,
      to: recipients,
      subject: input.subject,
      ...(resend.reason ? { providerError: resend.reason } : {}),
      ...(input.context ?? {}),
    },
  })

  return resend
}
