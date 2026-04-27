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
  code: z.string().min(3).max(64).regex(/^[A-Z0-9_-]+$/i, "Alphanumeric, _ and - only"),
  marketerUserId: z.string().cuid().optional().nullable(),
  marketerCommissionBps: z.number().int().min(0).max(5000).default(0), // cap 50%
  learnerDiscountBps: z.number().int().min(0).max(10000).default(0),
  validFrom: z.string().datetime().optional().nullable(),
  validTo: z.string().datetime().optional().nullable(),
  usageLimit: z.number().int().min(1).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const codes = await prisma.promoCode.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      marketer: { select: { id: true, email: true, name: true } },
    },
  })
  return NextResponse.json({ codes })
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

  const existing = await prisma.promoCode.findUnique({
    where: { code: parsed.data.code.toUpperCase() },
  })
  if (existing) {
    return NextResponse.json({ error: "Code already in use", code: "DUPLICATE" }, { status: 409 })
  }

  // Marketer must belong to this academy.
  if (parsed.data.marketerUserId) {
    const m = await prisma.academyMembership.findFirst({
      where: { userId: parsed.data.marketerUserId, academyId },
      select: { role: true },
    })
    if (!m || (m.role !== "MARKETER" && m.role !== "ACADEMY_ADMIN")) {
      return NextResponse.json(
        { error: "Marketer not in this academy", code: "BAD_MARKETER" },
        { status: 400 }
      )
    }
  }

  const promo = await prisma.promoCode.create({
    data: {
      academyId,
      code: parsed.data.code.toUpperCase(),
      marketerUserId: parsed.data.marketerUserId ?? null,
      marketerCommissionBps: parsed.data.marketerCommissionBps,
      learnerDiscountBps: parsed.data.learnerDiscountBps,
      validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
      validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
      usageLimit: parsed.data.usageLimit ?? null,
      notes: parsed.data.notes ?? null,
      isActive: true,
    },
  })

  await audit({
    action: "promo.create",
    resourceType: "promoCode",
    resourceId: promo.id,
    userId: session.user.id,
    academyId,
    metadata: { code: promo.code },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ promo }, { status: 201 })
}
