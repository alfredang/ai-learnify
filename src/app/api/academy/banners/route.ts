import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const createSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().max(160).optional().nullable(),
  targetUrl: z.string().url().optional().nullable(),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

async function resolveAdminAcademyId(userId: string, platformRole: string) {
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

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAdminAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const banners = await prisma.banner.findMany({
    where: { academyId },
    orderBy: { position: "asc" },
  })
  return NextResponse.json({ banners })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAdminAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  // Spec §4.1: up to 10 banners per academy.
  const existing = await prisma.banner.count({ where: { academyId } })
  if (existing >= 10) {
    return NextResponse.json(
      { error: "Banner limit reached", code: "BANNER_LIMIT" },
      { status: 409 }
    )
  }

  const banner = await prisma.banner.create({
    data: {
      ...parsed.data,
      title: parsed.data.title ?? null,
      targetUrl: parsed.data.targetUrl ?? null,
      academyId,
      placement: "CAROUSEL_TOP",
    },
  })

  await audit({
    action: "banner.create",
    resourceType: "banner",
    resourceId: banner.id,
    userId: session.user.id,
    academyId,
    metadata: { imageUrl: banner.imageUrl },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ banner }, { status: 201 })
}
