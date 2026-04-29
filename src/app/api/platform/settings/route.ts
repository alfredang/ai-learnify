import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { detectLockedFieldViolation } from "@/lib/locked-rules"

// Spec §6 — Platform Owner monetisation policy. Only the Platform Owner may
// read or modify these. Locked rules (learning model, certification logic,
// access window) are intentionally NOT exposed here.
const patchSchema = z.object({
  platformFeePercent: z.number().int().min(0).max(100).optional(),
  platformSupportFixedFeeMinor: z.number().int().min(0).max(100_000).optional(),
  defaultMarketerCommissionBps: z.number().int().min(0).max(10_000).optional(),
  defaultDeveloperSplitBps: z.number().int().min(0).max(10_000).optional(),
  minCoursePrice: z.number().min(0).max(99_999).optional(),
  maxCoursePrice: z.number().min(0).max(99_999).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.platformRole !== "PLATFORM_OWNER")
    return NextResponse.json({ error: "Platform Owner only" }, { status: 403 })

  const settings = await prisma.platformSettings.findFirst()
  return NextResponse.json({ data: settings })
}

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (session.user.platformRole !== "PLATFORM_OWNER")
    return NextResponse.json({ error: "Platform Owner only" }, { status: 403 })

  const rawBody = (await request.json()) as Record<string, unknown>

  // Spec §6 walkthrough — Platform Owner cannot modify locked rules.
  // Reject early if the patch tries to touch any forbidden field, before
  // the Zod schema strips them silently.
  const violation = detectLockedFieldViolation(rawBody)
  if (violation) {
    return NextResponse.json(
      {
        error: `Locked rule: ${violation.field} cannot be modified. ${violation.reason}`,
        code: "LOCKED_RULE",
      },
      { status: 400 }
    )
  }

  const parsed = patchSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const data = parsed.data
  if (
    data.minCoursePrice !== undefined &&
    data.maxCoursePrice !== undefined &&
    data.minCoursePrice > data.maxCoursePrice
  ) {
    return NextResponse.json(
      { error: "minCoursePrice cannot exceed maxCoursePrice" },
      { status: 400 }
    )
  }

  const existing = await prisma.platformSettings.findFirst({ select: { id: true } })

  const updated = existing
    ? await prisma.platformSettings.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.platformSettings.create({ data })

  await audit({
    action: "platform.settings.update",
    resourceType: "platformSettings",
    resourceId: updated.id,
    userId: session.user.id,
    metadata: data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ data: updated })
}
