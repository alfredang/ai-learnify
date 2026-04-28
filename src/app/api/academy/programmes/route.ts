import { NextResponse } from "next/server"
import { z } from "zod"
import slugify from "slugify"
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
  title: z.string().min(1).max(160),
  subtitle: z.string().max(240).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  thumbnail: z.string().url().nullable().optional(),
  price: z.number().min(0).max(99_999.99),
  currency: z.string().length(3).optional(),
  isFree: z.boolean().default(false),
  accessDurationDays: z.number().int().min(1).max(3650).default(90),
  courseIds: z.array(z.string().cuid()).min(2).max(50),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const programmes = await prisma.programme.findMany({
    where: { academyId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { courses: true, accessGrants: true } },
      courses: { select: { courseId: true, position: true }, orderBy: { position: "asc" } },
    },
  })
  return NextResponse.json({ programmes })
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base, { lower: true, strict: true }) || "programme"
  const candidate = `${root}-${Date.now().toString(36).slice(-5)}`
  const clash = await prisma.programme.findUnique({ where: { slug: candidate }, select: { id: true } })
  if (clash) return `${candidate}-${Math.random().toString(36).slice(2, 5)}`
  return candidate
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

  // Spec §6.3 — every course in a programme must belong to the same academy.
  const ownedCount = await prisma.course.count({
    where: { id: { in: parsed.data.courseIds }, academyId },
  })
  if (ownedCount !== parsed.data.courseIds.length) {
    return NextResponse.json(
      { error: "All courses must belong to this academy", code: "BAD_COURSE" },
      { status: 400 }
    )
  }

  const academy = await prisma.academy.findUnique({
    where: { id: academyId },
    select: { primaryCurrency: true },
  })

  const slug = await uniqueSlug(parsed.data.title)

  const programme = await prisma.programme.create({
    data: {
      academyId,
      title: parsed.data.title,
      slug,
      subtitle: parsed.data.subtitle ?? null,
      description: parsed.data.description ?? null,
      thumbnail: parsed.data.thumbnail ?? null,
      price: parsed.data.price,
      currency: (parsed.data.currency ?? academy?.primaryCurrency ?? "USD").toUpperCase(),
      isFree: parsed.data.isFree,
      accessDurationDays: parsed.data.accessDurationDays,
      status: "DRAFT",
      courses: {
        create: parsed.data.courseIds.map((courseId, idx) => ({
          courseId,
          position: idx,
        })),
      },
    },
  })

  await audit({
    action: "programme.create",
    resourceType: "programme",
    resourceId: programme.id,
    userId: session.user.id,
    academyId,
    metadata: { title: programme.title, slug },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ programme }, { status: 201 })
}
