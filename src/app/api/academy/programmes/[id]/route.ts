import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

async function assertOwnership(programmeId: string, userId: string, platformRole: string) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { academyId: true, status: true },
  })
  if (!programme) return { ok: false as const, status: 404 }
  if (platformRole === "PLATFORM_OWNER") {
    return { ok: true as const, academyId: programme.academyId, status: programme.status }
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, academyId: programme.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!m) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: programme.academyId, status: programme.status }
}

const patchSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  subtitle: z.string().max(240).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  thumbnail: z.string().url().nullable().optional(),
  price: z.number().min(0).max(99_999.99).optional(),
  currency: z.string().length(3).optional(),
  isFree: z.boolean().optional(),
  accessDurationDays: z.number().int().min(1).max(3650).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  courseIds: z.array(z.string().cuid()).min(2).max(50).optional(),
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
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.subtitle !== undefined) data.subtitle = parsed.data.subtitle
  if (parsed.data.description !== undefined) data.description = parsed.data.description
  if (parsed.data.thumbnail !== undefined) data.thumbnail = parsed.data.thumbnail
  if (parsed.data.price !== undefined) data.price = parsed.data.price
  if (parsed.data.currency !== undefined) data.currency = parsed.data.currency.toUpperCase()
  if (parsed.data.isFree !== undefined) data.isFree = parsed.data.isFree
  if (parsed.data.accessDurationDays !== undefined) {
    data.accessDurationDays = parsed.data.accessDurationDays
  }
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status
    if (parsed.data.status === "PUBLISHED" && own.status !== "PUBLISHED") {
      data.publishedAt = new Date()
    }
  }

  if (parsed.data.courseIds) {
    const ownedCount = await prisma.course.count({
      where: { id: { in: parsed.data.courseIds }, academyId: own.academyId },
    })
    if (ownedCount !== parsed.data.courseIds.length) {
      return NextResponse.json(
        { error: "All courses must belong to this academy", code: "BAD_COURSE" },
        { status: 400 }
      )
    }
  }

  // Spec §6.3 — a programme must bundle ≥2 courses before it can be
  // published. This guards the publish transition specifically (the
  // create endpoint already enforces ≥2 via Zod). When courseIds is
  // included in the same PATCH, Zod's .min(2) already caught it; we
  // only need to validate against the persisted count when courseIds
  // is not being changed in this request.
  if (
    parsed.data.status === "PUBLISHED" &&
    own.status !== "PUBLISHED" &&
    !parsed.data.courseIds
  ) {
    const persistedCount = await prisma.programmeCourse.count({
      where: { programmeId: id },
    })
    if (persistedCount < 2) {
      return NextResponse.json(
        {
          error:
            "Programme must contain at least 2 courses before it can be published.",
          code: "INSUFFICIENT_COURSES",
        },
        { status: 400 }
      )
    }
  }

  const programme = await prisma.$transaction(async (tx) => {
    const updated = await tx.programme.update({ where: { id }, data })
    if (parsed.data.courseIds) {
      await tx.programmeCourse.deleteMany({ where: { programmeId: id } })
      await tx.programmeCourse.createMany({
        data: parsed.data.courseIds.map((courseId, idx) => ({
          programmeId: id,
          courseId,
          position: idx,
        })),
      })
    }
    return updated
  })

  await audit({
    action: "programme.update",
    resourceType: "programme",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: { ...data, courseIdsChanged: !!parsed.data.courseIds },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ programme })
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

  // Spec §17 — soft-delete only. Programmes link to AccessGrant + LedgerEntry
  // rows; never call prisma.programme.delete(). Archive sets status=ARCHIVED
  // and stamps deletedAt; existing access grants stay valid until expiry.
  const grants = await prisma.accessGrant.count({ where: { programmeId: id } })

  await prisma.programme.update({
    where: { id },
    data: {
      status: "ARCHIVED",
      deletedAt: new Date(),
    },
  })

  await audit({
    action: "programme.archive",
    resourceType: "programme",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: { activeGrantsAtArchive: grants },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({
    ok: true,
    message:
      grants > 0
        ? `Programme archived. ${grants} learner(s) keep their access until expiry; the programme is hidden from the public catalogue.`
        : "Programme archived. It is hidden from the public catalogue.",
  })
}
