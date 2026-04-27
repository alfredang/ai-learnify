import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

/**
 * Phase 9 — Spec §17 / §18 account deactivation.
 *
 * Soft-delete only: we set `isActive=false` and stamp `deactivatedAt` so
 * the user can't log in, but the learner's certificates, invoices, and
 * audit trail are preserved indefinitely (spec §17 "Learner records
 * retained indefinitely").
 *
 * Hard deletion is intentionally NOT offered — it would break financial
 * audit requirements. Admins can re-activate via Prisma Studio or an
 * admin-only endpoint.
 */

const schema = z.object({
  confirmEmail: z.string().email(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, isActive: true },
  })
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (parsed.data.confirmEmail.toLowerCase() !== user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Email confirmation did not match", code: "EMAIL_MISMATCH" },
      { status: 400 }
    )
  }

  if (!user.isActive) {
    return NextResponse.json({ ok: true, alreadyDeactivated: true })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
    },
  })

  await audit({
    action: "privacy.deactivate",
    resourceType: "user",
    resourceId: user.id,
    userId: user.id,
    metadata: { reason: parsed.data.reason ?? null },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
