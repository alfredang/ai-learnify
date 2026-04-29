import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

async function assertOwnership(courseId: string, userId: string, platformRole: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { academyId: true, status: true },
  })
  if (!course) return { ok: false as const, status: 404 }
  if (platformRole === "PLATFORM_OWNER") {
    return { ok: true as const, academyId: course.academyId, status: course.status }
  }
  if (!course.academyId) return { ok: false as const, status: 403 }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, academyId: course.academyId, role: "ACADEMY_ADMIN" },
    select: { id: true },
  })
  if (!m) return { ok: false as const, status: 403 }
  return { ok: true as const, academyId: course.academyId, status: course.status }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  if (own.status !== "PENDING_REVIEW" && own.status !== "REJECTED") {
    return NextResponse.json(
      {
        error: `Course is ${own.status.toLowerCase()} — only PENDING_REVIEW or REJECTED courses can be approved.`,
        code: "INVALID_STATE",
      },
      { status: 409 }
    )
  }

  const sectionCount = await prisma.section.count({ where: { courseId: id } })
  if (sectionCount === 0) {
    return NextResponse.json(
      { error: "Course has no sections — cannot publish empty course.", code: "EMPTY_COURSE" },
      { status: 400 }
    )
  }

  const wasAlreadyPublishedOnce = await prisma.course.findUnique({
    where: { id },
    select: { publishedAt: true },
  })

  const course = await prisma.course.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      rejectionReason: null,
      publishedAt: wasAlreadyPublishedOnce?.publishedAt ?? new Date(),
    },
  })

  await audit({
    action: "course.approve",
    resourceType: "course",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: { previousStatus: own.status },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ course })
}
