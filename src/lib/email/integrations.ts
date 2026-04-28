import { prisma } from "@/lib/prisma"
import { decryptString, encryptString, type EncryptedString } from "@/lib/encryption"
import type { GmailConfig } from "@/lib/email/gmail"
import type { SmtpConfig } from "@/lib/email/smtp"

/**
 * Per-academy email provider configuration. Stored as JSON on the
 * Academy.integrations column. Sensitive values are kept as
 * EncryptedString triplets so a DB read alone never leaks them.
 *
 * Shape:
 *   {
 *     gmail?:   { enabled, clientId, clientSecret*, refreshToken*, fromEmail }
 *     smtp?:    { enabled, host, port, username, password*, fromEmail, secure }
 *     activeProvider?: "gmail" | "smtp" | null
 *   }
 *  *encrypted (EncryptedString | null)
 */

type StoredEncrypted = EncryptedString | string | null | undefined

export type StoredIntegrations = {
  gmail?: {
    enabled?: boolean
    clientId?: string
    clientSecret?: StoredEncrypted
    refreshToken?: StoredEncrypted
    fromEmail?: string
  }
  smtp?: {
    enabled?: boolean
    host?: string
    port?: number
    username?: string
    password?: StoredEncrypted
    fromEmail?: string
    secure?: boolean
  }
  activeProvider?: "gmail" | "smtp" | null
}

export type ResolvedProvider =
  | { provider: "gmail"; config: GmailConfig }
  | { provider: "smtp"; config: SmtpConfig }
  | { provider: "none"; reason: string }

function asEncrypted(v: StoredEncrypted): EncryptedString | null {
  if (!v) return null
  if (typeof v === "string") return null // legacy plaintext won't decrypt; treat as missing
  if (typeof v === "object" && "cipher" in v && "iv" in v && "tag" in v) {
    return v
  }
  return null
}

function safeDecrypt(v: StoredEncrypted): string {
  const enc = asEncrypted(v)
  if (!enc) return typeof v === "string" ? v : ""
  try {
    return decryptString(enc)
  } catch {
    return ""
  }
}

/** True if at least one credential field has been configured (encrypted). */
function gmailLooksConfigured(g?: StoredIntegrations["gmail"]): boolean {
  return Boolean(
    g?.enabled &&
      g.clientId &&
      asEncrypted(g.clientSecret) &&
      asEncrypted(g.refreshToken) &&
      g.fromEmail
  )
}

function smtpLooksConfigured(s?: StoredIntegrations["smtp"]): boolean {
  return Boolean(s?.enabled && s.host && s.fromEmail)
}

/**
 * Load + decrypt the active provider for an academy. Returns
 * {provider:"none"} if the academy hasn't configured anything (caller
 * should fall back to platform default, e.g. Resend).
 */
export async function resolveActiveProvider(
  academyId: string
): Promise<ResolvedProvider> {
  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { integrations: true },
  })

  const stored = (academy?.integrations as StoredIntegrations | null) ?? null
  if (!stored) return { provider: "none", reason: "no integrations configured" }

  const active = stored.activeProvider ?? null
  if (active === "gmail" && gmailLooksConfigured(stored.gmail)) {
    const g = stored.gmail!
    return {
      provider: "gmail",
      config: {
        clientId: g.clientId ?? "",
        clientSecret: safeDecrypt(g.clientSecret),
        refreshToken: safeDecrypt(g.refreshToken),
        fromEmail: g.fromEmail ?? "",
      },
    }
  }

  if (active === "smtp" && smtpLooksConfigured(stored.smtp)) {
    const s = stored.smtp!
    return {
      provider: "smtp",
      config: {
        host: s.host ?? "",
        port: s.port ?? 587,
        username: s.username ?? "",
        password: safeDecrypt(s.password),
        fromEmail: s.fromEmail ?? "",
        secure: Boolean(s.secure),
      },
    }
  }

  return {
    provider: "none",
    reason:
      active === null
        ? "no active provider selected"
        : `active provider "${active}" not fully configured`,
  }
}

/** Encrypt-or-keep helper for the integrations API write path. */
export function encryptOrKeep(
  incoming: string | undefined,
  current: StoredEncrypted
): EncryptedString | null {
  if (incoming === undefined) return asEncrypted(current)
  if (incoming === "" || incoming === "***") return asEncrypted(current)
  return encryptString(incoming)
}

/** True iff a stored secret slot currently holds a real encrypted value. */
export function hasSecret(v: StoredEncrypted): boolean {
  return asEncrypted(v) !== null
}
