import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const patchSchema = z.object({
  imageUrl: z.string().url().optional(),
  title: z.string().max(160).nullable().optional(),
  targetUrl: z.string().url().nullable().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

async function assertBannerOwnership(bannerId: string, userId: string, platformRole: string) {
  const banner = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { academyId: true },
  })
  if (!banner) return { ok: false as const, status: 404 }

  if (platformRole === "PLATFORM_OWNER") return { ok: true as const, academyId: banner.academyId }

  const membership = await prisma.academyMembership.findFirst({
    where: { userId, academyId: banner.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!membership) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: banner.academyId }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertBannerOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  const body = await request.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const banner = await prisma.banner.update({ where: { id }, data: parsed.data })

  await audit({
    action: "banner.update",
    resourceType: "banner",
    resourceId: banner.id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: parsed.data,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ banner })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertBannerOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  await prisma.banner.delete({ where: { id } })

  await audit({
    action: "banner.delete",
    resourceType: "banner",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ ok: true })
}
