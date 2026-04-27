import { createHash } from "node:crypto"
import { prisma } from "@/lib/prisma"

export type AuditInput = {
  action: string
  resourceType: string
  resourceId?: string | null
  userId?: string | null
  academyId?: string | null
  metadata?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
}

function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const salt = process.env.AUDIT_IP_SALT ?? "learnify-audit"
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32)
}

/**
 * Append-only audit log write. Call from every server-side write path
 * (API route, server action, webhook handler) that mutates user or
 * financial state. Never throws — failures are swallowed and reported to
 * stderr so audit infrastructure cannot take down a user action.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        userId: input.userId ?? null,
        academyId: input.academyId ?? null,
        metadata: (input.metadata as object | undefined) ?? undefined,
        ipHash: hashIp(input.ip),
        userAgent: input.userAgent ?? null,
      },
    })
  } catch (err) {
    console.error("[audit] failed to write log", {
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

/**
 * Extract a best-effort client IP from a Next.js Request. Always hashed
 * before storage via audit().
 */
export function getRequestIp(req: Request): string | null {
  const h = req.headers
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  )
}
