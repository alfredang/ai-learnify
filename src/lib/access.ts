import type { AccessGrant, AccessGrantSource, ProductType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export type AccessCheckResult =
  | { allowed: true; grant: AccessGrant }
  | { allowed: false; reason: "NO_GRANT" | "EXPIRED" | "REVOKED" }

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

/**
 * Check whether a user currently has active access to a course, honouring
 * both direct course grants and programme-level grants that cover it.
 *
 * Spec §11.1: access is 3 months / 90 days from payment for paid content,
 * and indefinite for the Complimentary Programme.
 */
export async function checkCourseAccess(
  userId: string,
  courseId: string
): Promise<AccessCheckResult> {
  const now = new Date()

  // Direct course grant
  const directGrant = await prisma.accessGrant.findFirst({
    where: { userId, courseId, isActive: true },
  })

  if (directGrant) {
    if (directGrant.revokedAt) return { allowed: false, reason: "REVOKED" }
    if (directGrant.expiresAt <= now) return { allowed: false, reason: "EXPIRED" }
    return { allowed: true, grant: directGrant }
  }

  // Programme grant that includes this course
  const programmeGrant = await prisma.accessGrant.findFirst({
    where: {
      userId,
      isActive: true,
      programme: {
        courses: { some: { courseId } },
      },
    },
  })

  if (programmeGrant) {
    if (programmeGrant.revokedAt) return { allowed: false, reason: "REVOKED" }
    if (programmeGrant.expiresAt <= now) return { allowed: false, reason: "EXPIRED" }
    return { allowed: true, grant: programmeGrant }
  }

  return { allowed: false, reason: "NO_GRANT" }
}

export async function checkProgrammeAccess(
  userId: string,
  programmeId: string
): Promise<AccessCheckResult> {
  const now = new Date()
  const grant = await prisma.accessGrant.findFirst({
    where: { userId, programmeId, isActive: true },
  })
  if (!grant) return { allowed: false, reason: "NO_GRANT" }
  if (grant.revokedAt) return { allowed: false, reason: "REVOKED" }
  if (grant.expiresAt <= now) return { allowed: false, reason: "EXPIRED" }
  return { allowed: true, grant }
}

/**
 * Throw when a user doesn't have access. Use from server components,
 * API routes, and server actions.
 */
export async function assertCourseAccess(userId: string, courseId: string) {
  const res = await checkCourseAccess(userId, courseId)
  if (!res.allowed) {
    const err = new Error(`course access denied: ${res.reason}`)
    ;(err as Error & { code?: string }).code = res.reason
    throw err
  }
  return res.grant
}

export async function assertProgrammeAccess(userId: string, programmeId: string) {
  const res = await checkProgrammeAccess(userId, programmeId)
  if (!res.allowed) {
    const err = new Error(`programme access denied: ${res.reason}`)
    ;(err as Error & { code?: string }).code = res.reason
    throw err
  }
  return res.grant
}

/**
 * Grant a fresh access window. Idempotent — re-grants extend the expiry.
 * Used by the Stripe webhook, admin overrides, and the complimentary auto-
 * grant hook in the register API.
 */
export async function grantCourseAccess(
  userId: string,
  courseId: string,
  opts: { source?: AccessGrantSource; durationDays?: number } = {}
) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { accessDurationDays: true },
  })
  const durationDays = opts.durationDays ?? course?.accessDurationDays ?? 90
  const now = new Date()

  const existing = await prisma.accessGrant.findFirst({ where: { userId, courseId } })

  if (existing) {
    return prisma.accessGrant.update({
      where: { id: existing.id },
      data: {
        expiresAt: addDays(now, durationDays),
        isActive: true,
        revokedAt: null,
        revokedReason: null,
        source: opts.source ?? existing.source,
      },
    })
  }

  return prisma.accessGrant.create({
    data: {
      userId,
      courseId,
      productType: "COURSE" satisfies ProductType,
      source: opts.source ?? "PURCHASE",
      grantedAt: now,
      expiresAt: addDays(now, durationDays),
      isActive: true,
    },
  })
}

export async function grantProgrammeAccess(
  userId: string,
  programmeId: string,
  opts: { source?: AccessGrantSource; durationDays?: number } = {}
) {
  const programme = await prisma.programme.findUnique({
    where: { id: programmeId },
    select: { accessDurationDays: true },
  })
  const durationDays = opts.durationDays ?? programme?.accessDurationDays ?? 90
  const now = new Date()

  const existing = await prisma.accessGrant.findFirst({ where: { userId, programmeId } })

  if (existing) {
    return prisma.accessGrant.update({
      where: { id: existing.id },
      data: {
        expiresAt: addDays(now, durationDays),
        isActive: true,
        revokedAt: null,
        revokedReason: null,
        source: opts.source ?? existing.source,
      },
    })
  }

  return prisma.accessGrant.create({
    data: {
      userId,
      programmeId,
      productType: "PROGRAMME" satisfies ProductType,
      source: opts.source ?? "PURCHASE",
      grantedAt: now,
      expiresAt: addDays(now, durationDays),
      isActive: true,
    },
  })
}
