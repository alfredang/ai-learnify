import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"

const patchSchema = z.object({
  // Legacy single-platform-role field (kept for backward compat).
  platformRole: z.enum(["NONE", "PLATFORM_OWNER", "PLATFORM_SUPPORT"]).optional(),
  // New canonical multi-role array. When provided, replaces platformRoles
  // wholesale and the legacy platformRole is auto-synced to the highest-
  // priority entry (Owner > Support > NONE).
  platformRoles: z
    .array(z.enum(["PLATFORM_OWNER", "PLATFORM_SUPPORT"]))
    .optional(),
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
    select: { id: true, platformRole: true, platformRoles: true },
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

  // Self-demotion guard: actor cannot remove their own Owner status from
  // either the legacy single field or the new multi-role array.
  if (target.id === session.user.id) {
    const droppingViaLegacy =
      parsed.data.platformRole !== undefined &&
      parsed.data.platformRole !== "PLATFORM_OWNER"
    const droppingViaArray =
      parsed.data.platformRoles !== undefined &&
      !parsed.data.platformRoles.includes("PLATFORM_OWNER")
    if (droppingViaLegacy || droppingViaArray) {
      return NextResponse.json(
        {
          error: "You cannot remove your own Platform Owner role.",
          code: "SELF_DEMOTION",
        },
        { status: 400 }
      )
    }
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
    // platformRoles[] is the canonical write path. We auto-derive the
    // legacy platformRole single-value field from the highest priority
    // entry (Owner > Support > NONE) so old `=== "PLATFORM_OWNER"` checks
    // continue to work.
    if (parsed.data.platformRoles !== undefined) {
      const derivedLegacy = parsed.data.platformRoles.includes("PLATFORM_OWNER")
        ? "PLATFORM_OWNER"
        : parsed.data.platformRoles.includes("PLATFORM_SUPPORT")
        ? "PLATFORM_SUPPORT"
        : "NONE"
      await tx.user.update({
        where: { id },
        data: {
          platformRoles: parsed.data.platformRoles,
          platformRole: derivedLegacy,
        },
      })
    } else if (parsed.data.platformRole !== undefined) {
      // Legacy single-field write path: sync platformRoles[] to match.
      await tx.user.update({
        where: { id },
        data: {
          platformRole: parsed.data.platformRole,
          platformRoles:
            parsed.data.platformRole === "NONE" ? [] : [parsed.data.platformRole],
        },
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
        platformRoles: true,
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
