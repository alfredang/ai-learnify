import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
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
