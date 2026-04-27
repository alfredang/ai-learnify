import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

/**
 * Spec §17 — Academy Admin / Platform Owner may deactivate a learner.
 * Soft-delete only: sets `isActive=false`, stamps `deactivatedAt`,
 * preserves every record (certs, invoices, audit trail).
 *
 * Authz: caller must be an Academy Admin of an academy the learner
 * actually belongs to (or Platform Owner for anyone).
 */

const schema = z.object({
  reason: z.string().max(500).optional(),
  reactivate: z.boolean().optional(),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: targetUserId } = await params
  if (targetUserId === session.user.id) {
    return NextResponse.json(
      { error: "Use /api/profile/deactivate to deactivate your own account." },
      { status: 400 }
    )
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      email: true,
      isActive: true,
      platformRole: true,
      academyMemberships: { select: { academyId: true, role: true } },
    },
  })
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isPlatformOwner = session.user.platformRole === "PLATFORM_OWNER"
  const callerAdminAcademies = new Set(
    (session.user.memberships ?? [])
      .filter((m) => m.role === "ACADEMY_ADMIN")
      .map((m) => m.academyId)
  )
  const sharesAnAcademy = target.academyMemberships.some((m) =>
    callerAdminAcademies.has(m.academyId)
  )
  if (!isPlatformOwner && !sharesAnAcademy) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Spec §17 implies deactivation is for learners. Block deactivating
  // staff accounts from here — Platform Owner can use admin tooling.
  const targetIsStaff =
    target.platformRole !== "NONE" ||
    target.academyMemberships.some((m) => m.role !== "LEARNER")
  if (targetIsStaff && !isPlatformOwner) {
    return NextResponse.json(
      {
        error: "Only Platform Owner may deactivate staff accounts.",
        code: "TARGET_IS_STAFF",
      },
      { status: 403 }
    )
  }

  const reactivate = parsed.data.reactivate === true
  const nextActive = reactivate ? true : false

  if (target.isActive === nextActive) {
    return NextResponse.json({ ok: true, noChange: true })
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      isActive: nextActive,
      deactivatedAt: reactivate ? null : new Date(),
    },
  })

  await audit({
    action: reactivate ? "admin.reactivate" : "admin.deactivate",
    resourceType: "user",
    resourceId: target.id,
    userId: session.user.id,
    metadata: {
      targetEmail: target.email,
      reason: parsed.data.reason ?? null,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true, reactivated: reactivate })
}
