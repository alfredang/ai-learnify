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
  jurisdiction: z.string().min(2).max(20).regex(/^[A-Za-z0-9-]+$/, "Letters, digits and dashes only"),
  label: z.string().min(1).max(40),
  rateBps: z.number().int().min(0).max(10_000),
  appliesFrom: z.string().datetime().optional(),
  isActive: z.boolean().default(true),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const rates = await prisma.taxRate.findMany({
    where: { academyId },
    orderBy: [{ isActive: "desc" }, { jurisdiction: "asc" }, { appliesFrom: "desc" }],
  })
  return NextResponse.json({ rates })
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

  const rate = await prisma.taxRate.create({
    data: {
      academyId,
      jurisdiction: parsed.data.jurisdiction.toUpperCase(),
      label: parsed.data.label,
      rateBps: parsed.data.rateBps,
      appliesFrom: parsed.data.appliesFrom ? new Date(parsed.data.appliesFrom) : new Date(),
      isActive: parsed.data.isActive,
    },
  })

  await audit({
    action: "taxRate.create",
    resourceType: "taxRate",
    resourceId: rate.id,
    userId: session.user.id,
    academyId,
    metadata: { jurisdiction: rate.jurisdiction, rateBps: rate.rateBps },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ rate }, { status: 201 })
}
