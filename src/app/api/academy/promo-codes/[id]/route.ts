import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  notes: z.string().max(500).nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
})

async function assertPromoOwnership(promoId: string, userId: string, platformRole: string) {
  const promo = await prisma.promoCode.findUnique({
    where: { id: promoId },
    select: { academyId: true },
  })
  if (!promo) return { ok: false as const, status: 404 }
  if (platformRole === "PLATFORM_OWNER") return { ok: true as const, academyId: promo.academyId }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, academyId: promo.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!m) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: promo.academyId }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertPromoOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive
  if (parsed.data.notes !== undefined) data.notes = parsed.data.notes
  if (parsed.data.validTo !== undefined) {
    data.validTo = parsed.data.validTo ? new Date(parsed.data.validTo) : null
  }
  if (parsed.data.usageLimit !== undefined) data.usageLimit = parsed.data.usageLimit

  const promo = await prisma.promoCode.update({ where: { id }, data })

  await audit({
    action: "promo.update",
    resourceType: "promoCode",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ promo })
}
