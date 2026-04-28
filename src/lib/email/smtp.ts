import nodemailer from "nodemailer"

/**
 * SMTP send via nodemailer. Caller passes already-decrypted credentials.
 * No connection caching — we open + close per send to keep the surface
 * tiny. Email volume here is reminder + invoice + certificate, not a
 * mail blaster.
 */

export type SmtpConfig = {
  host: string
  port: number
  username: string
  password: string
  fromEmail: string
  /** TLS-on-connect (port 465). Otherwise STARTTLS is used opportunistically. */
  secure: boolean
}

export type SmtpAttachment = {
  filename: string
  /** base64-encoded content. */
  content: string
}

export type SmtpSendInput = {
  config: SmtpConfig
  to: string[]
  subject: string
  html: string
  text?: string
  attachments?: SmtpAttachment[]
  /** Extra headers (e.g. tagging). */
  headers?: Record<string, string>
}

export type SmtpSendResult = {
  ok: boolean
  messageId?: string
  error?: string
}

export async function sendViaSmtp(input: SmtpSendInput): Promise<SmtpSendResult> {
  const { config } = input
  if (!config.host || !config.fromEmail) {
    return { ok: false, error: "smtp host / sender not configured" }
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username
      ? { user: config.username, pass: config.password }
      : undefined,
  })

  try {
    const info = await transporter.sendMail({
      from: config.fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64",
      })),
    })
    return { ok: true, messageId: info.messageId }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  } finally {
    transporter.close()
  }
}
