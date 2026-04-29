import { NextResponse } from "next/server"
import { z } from "zod"
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

const rejectSchema = z.object({
  reason: z.string().min(5, "Rejection reason must be at least 5 characters").max(2000),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const own = await assertOwnership(id, session.user.id, session.user.platformRole ?? "NONE")
  if (!own.ok) return NextResponse.json({ error: "Forbidden" }, { status: own.status })

  if (own.status !== "PENDING_REVIEW" && own.status !== "PUBLISHED") {
    return NextResponse.json(
      {
        error: `Course is ${own.status.toLowerCase()} — only PENDING_REVIEW or PUBLISHED courses can be rejected.`,
        code: "INVALID_STATE",
      },
      { status: 409 }
    )
  }

  const parsed = rejectSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const course = await prisma.course.update({
    where: { id },
    data: {
      status: "REJECTED",
      rejectionReason: parsed.data.reason,
    },
  })

  await audit({
    action: "course.reject",
    resourceType: "course",
    resourceId: id,
    userId: session.user.id,
    academyId: own.academyId,
    metadata: { previousStatus: own.status, reason: parsed.data.reason },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ course })
}
