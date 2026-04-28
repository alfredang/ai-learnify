import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const patchSchema = z.object({
  platformRole: z.enum(["NONE", "PLATFORM_OWNER", "PLATFORM_SUPPORT"]).optional(),
  academyMemberships: z
    .array(
      z.object({
        academyId: z.string().min(1),
        role: z.enum(["LEARNER", "COURSE_DEVELOPER", "ACADEMY_ADMIN", "MARKETER"]),
      })
    )
    .optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  // Spec §1 governance — only the Platform Owner may change roles.
  if (session.user.platformRole !== "PLATFORM_OWNER") {
    return NextResponse.json(
      { error: "Platform Owner only" },
      { status: 403 }
    )
  }

  const { id } = await params

  // Self-demotion guard: if the actor is editing their own platformRole,
  // refuse to drop them out of PLATFORM_OWNER. Otherwise the only owner
  // could lock themselves out.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, platformRole: true },
  })
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const parsed = patchSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  if (
    parsed.data.platformRole !== undefined &&
    parsed.data.platformRole !== "PLATFORM_OWNER" &&
    target.id === session.user.id
  ) {
    return NextResponse.json(
      {
        error: "You cannot remove your own Platform Owner role.",
        code: "SELF_DEMOTION",
      },
      { status: 400 }
    )
  }

  // If memberships are being replaced, every academyId must exist.
  if (parsed.data.academyMemberships && parsed.data.academyMemberships.length > 0) {
    const academyIds = [
      ...new Set(parsed.data.academyMemberships.map((m) => m.academyId)),
    ]
    const found = await prisma.academy.count({
      where: { id: { in: academyIds } },
    })
    if (found !== academyIds.length) {
      return NextResponse.json(
        { error: "One or more academies do not exist", code: "BAD_ACADEMY" },
        { status: 400 }
      )
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (parsed.data.platformRole !== undefined) {
      await tx.user.update({
        where: { id },
        data: { platformRole: parsed.data.platformRole },
      })
    }

    if (parsed.data.academyMemberships !== undefined) {
      // Replace memberships wholesale — simpler than a diff and avoids
      // partial-state surprises if the request is interrupted.
      await tx.academyMembership.deleteMany({ where: { userId: id } })
      if (parsed.data.academyMemberships.length > 0) {
        await tx.academyMembership.createMany({
          data: parsed.data.academyMemberships.map((m) => ({
            userId: id,
            academyId: m.academyId,
            role: m.role,
          })),
        })
      }
    }

    return tx.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        academyMemberships: {
          select: {
            academyId: true,
            role: true,
            academy: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    })
  })

  await audit({
    action: "user.roles.update",
    resourceType: "user",
    resourceId: id,
    userId: session.user.id,
    metadata: {
      platformRole: parsed.data.platformRole,
      memberships: parsed.data.academyMemberships,
    },
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  })

  return NextResponse.json({ user: updated })
}
