import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { env } from "@/lib/env"

/**
 * AES-256-GCM helper for tenant-scoped credentials (Phase 7 — Spec §8.3).
 *
 * Used by the Academy Admin AI credential setting to keep a Claude OAuth
 * token at rest in Postgres without exposing it as plaintext to anyone
 * with read access to the database. The encryption key is loaded once
 * from CREDENTIAL_ENCRYPTION_KEY and never logged.
 *
 * Storage convention: each ciphertext is paired with its IV and the
 * auth tag in three columns. Decryption reconstructs all three.
 */

const ALGORITHM = "aes-256-gcm"
const KEY_BYTES = 32
const IV_BYTES = 12 // GCM standard

let cachedKey: Buffer | null = null

function key(): Buffer {
  if (cachedKey) return cachedKey
  const raw = env.CREDENTIAL_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY is not set. Generate with `openssl rand -base64 32` and add to .env."
    )
  }
  // Accept either base64 (preferred — what `openssl rand -base64 32` emits)
  // or raw 32-byte hex. Reject anything that doesn't decode to 32 bytes so
  // a typo doesn't silently produce a weak key.
  let buf: Buffer
  try {
    buf = Buffer.from(raw, "base64")
    if (buf.length !== KEY_BYTES) {
      buf = Buffer.from(raw, "hex")
    }
  } catch {
    buf = Buffer.from(raw, "hex")
  }
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `CREDENTIAL_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (use \`openssl rand -base64 32\`).`
    )
  }
  cachedKey = buf
  return cachedKey
}

export type EncryptedString = {
  cipher: string // base64
  iv: string // base64
  tag: string // base64
}

export function encryptString(plaintext: string): EncryptedString {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key(), iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  }
}

export function decryptString(encrypted: EncryptedString): string {
  const iv = Buffer.from(encrypted.iv, "base64")
  const tag = Buffer.from(encrypted.tag, "base64")
  const enc = Buffer.from(encrypted.cipher, "base64")
  const decipher = createDecipheriv(ALGORITHM, key(), iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(enc), decipher.final()])
  return dec.toString("utf8")
}

/** Convenience for masking a token in UI: returns last 4 chars. */
export function tokenLast4(token: string): string {
  const trimmed = token.trim()
  return trimmed.length <= 4 ? trimmed : trimmed.slice(-4)
}
