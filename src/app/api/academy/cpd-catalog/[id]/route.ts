import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

async function assertOwnership(entryId: string, userId: string, platformRole: string) {
  const entry = await prisma.cpdCatalog.findUnique({
    where: { id: entryId },
    select: { academyId: true },
  })
  if (!entry) return { ok: false as const, status: 404 }
  if (platformRole === "PLATFORM_OWNER") return { ok: true as const, academyId: entry.academyId }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, academyId: entry.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!m) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: entry.academyId }
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  points: z.number().min(0).max(999.99).optional(),
  badgeUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
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

  const entry = await prisma.cpdCatalog.update({ where: { id }, data: parsed.data })

  await audit({
    action: "cpdCatalog.update",
    resourceType: "cpdCatalog",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: parsed.data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ entry })
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

  const inUse = await prisma.course.count({ where: { cpdCatalogId: id } })
  if (inUse > 0) {
    return NextResponse.json(
      { error: `In use by ${inUse} course(s) — unassign first`, code: "IN_USE" },
      { status: 409 }
    )
  }

  await prisma.cpdCatalog.delete({ where: { id } })

  await audit({
    action: "cpdCatalog.delete",
    resourceType: "cpdCatalog",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
