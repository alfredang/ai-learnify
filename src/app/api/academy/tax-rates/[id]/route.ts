import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

async function assertOwnership(rateId: string, userId: string, platformRole: string) {
  const rate = await prisma.taxRate.findUnique({
    where: { id: rateId },
    select: { academyId: true },
  })
  if (!rate) return { ok: false as const, status: 404 }
  if (platformRole === "PLATFORM_OWNER") return { ok: true as const, academyId: rate.academyId }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, academyId: rate.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!m) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: rate.academyId }
}

const patchSchema = z.object({
  jurisdiction: z.string().min(2).max(20).regex(/^[A-Za-z0-9-]+$/).optional(),
  label: z.string().min(1).max(40).optional(),
  rateBps: z.number().int().min(0).max(10_000).optional(),
  appliesFrom: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.jurisdiction) data.jurisdiction = parsed.data.jurisdiction.toUpperCase()
  if (parsed.data.label !== undefined) data.label = parsed.data.label
  if (parsed.data.rateBps !== undefined) data.rateBps = parsed.data.rateBps
  if (parsed.data.appliesFrom) data.appliesFrom = new Date(parsed.data.appliesFrom)
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive

  const rate = await prisma.taxRate.update({ where: { id }, data })

  await audit({
    action: "taxRate.update",
    resourceType: "taxRate",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ rate })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  await prisma.taxRate.delete({ where: { id } })

  await audit({
    action: "taxRate.delete",
    resourceType: "taxRate",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
