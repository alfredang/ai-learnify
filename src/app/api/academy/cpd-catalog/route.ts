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

const createSchema = z.object({
  name: z.string().min(1).max(120),
  points: z.number().min(0).max(999.99),
  badgeUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const entries = await prisma.cpdCatalog.findMany({
    where: { academyId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return NextResponse.json({ entries })
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = createSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }

  const entry = await prisma.cpdCatalog.create({
    data: {
      academyId,
      name: parsed.data.name,
      points: parsed.data.points,
      badgeUrl: parsed.data.badgeUrl ?? null,
      sortOrder: parsed.data.sortOrder ?? 0,
    },
  })

  await audit({
    action: "cpdCatalog.create",
    resourceType: "cpdCatalog",
    resourceId: entry.id,
    userId: session.user.id,
    academyId,
    metadata: { name: entry.name },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ entry }, { status: 201 })
}
