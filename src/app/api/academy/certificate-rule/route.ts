import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { assertCertRuleStructureIntact } from "@/lib/locked-rules"

/**
 * Spec §12 — certification thresholds are configured PER-ACADEMY by the
 * Academy Admin (or Platform Owner only as a fall-through admin action).
 * The Platform Owner does not configure cert rules globally — spec §6
 * walkthrough: "Cannot modify locked rules (learning model, certification
 * logic)". A Platform Owner acting as a tenant admin still operates inside
 * a tenant's CertificateRule row, never on a global rule.
 */
async function resolveAcademyId(userId: string, platformRole: string) {
  // Academy Admin path — always tenant-scoped.
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  if (m?.academyId) return m.academyId

  // Platform Owner fallback: still operate per-tenant. Refuse if more
  // than one academy exists so the owner doesn't accidentally edit the
  // wrong tenant's rule from a global console.
  if (platformRole === "PLATFORM_OWNER") {
    const all = await prisma.academy.findMany({
      where: { isActive: true },
      select: { id: true },
    })
    if (all.length === 1) return all[0].id
  }
  return null
}

const patchSchema = z.object({
  minContentPct: z.number().int().min(0).max(100).optional(),
  minAssessmentPct: z.number().int().min(0).max(100).optional(),
  requiresSurvey: z.boolean().optional(),
  mustBeBeforeExpiry: z.boolean().optional(),
})

/**
 * PATCH /api/academy/certificate-rule
 * Upserts the active CertificateRule for the caller's academy. Spec §12 —
 * each tenant configures its own thresholds; defaults are 50% / 80% / survey
 * required / before expiry.
 */
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  // Spec §12 — the four-gate certification structure is locked. Per-academy
  // customisation may tune the numeric thresholds, but cannot remove the
  // survey-completed or before-expiry gates entirely.
  const structureCheck = assertCertRuleStructureIntact(parsed.data)
  if (!structureCheck.ok) {
    return NextResponse.json(
      { error: structureCheck.reason, code: "LOCKED_RULE" },
      { status: 400 }
    )
  }

  const existing = await prisma.certificateRule.findFirst({
    where: { academyId, isActive: true },
    select: { id: true },
  })

  const rule = existing
    ? await prisma.certificateRule.update({
        where: { id: existing.id },
        data: parsed.data,
      })
    : await prisma.certificateRule.create({
        data: {
          academyId,
          minContentPct: parsed.data.minContentPct ?? 50,
          minAssessmentPct: parsed.data.minAssessmentPct ?? 80,
          requiresSurvey: parsed.data.requiresSurvey ?? true,
          mustBeBeforeExpiry: parsed.data.mustBeBeforeExpiry ?? true,
          isActive: true,
        },
      })

  await audit({
    action: "certificateRule.update",
    resourceType: "certificateRule",
    resourceId: rule.id,
    userId: session.user.id,
    academyId,
    metadata: parsed.data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ rule })
}
