/**
 * Phase 1 data migration — idempotent.
 *
 * 1. Ensure a "Default Academy" exists.
 * 2. For every existing user, create an AcademyMembership in Default Academy
 *    with role mapped from legacy User.role:
 *      STUDENT    -> LEARNER
 *      INSTRUCTOR -> COURSE_DEVELOPER
 *      ADMIN      -> ACADEMY_ADMIN  (also sets platformRole = PLATFORM_OWNER)
 * 3. Backfill Course.academyId to Default Academy.
 * 4. Backfill User.nameToBeCalled and User.certificateName from `name` when missing.
 *
 * Safe to re-run: all writes use upsert or skip-when-exists.
 */

import { PrismaClient, type AcademyRole } from "@prisma/client"
import { audit } from "../src/lib/audit"

const prisma = new PrismaClient()

const DEFAULT_ACADEMY_SLUG = "default"

async function ensureDefaultAcademy() {
  const existing = await prisma.academy.findUnique({ where: { slug: DEFAULT_ACADEMY_SLUG } })
  if (existing) return existing
  const created = await prisma.academy.create({
    data: {
      slug: DEFAULT_ACADEMY_SLUG,
      name: "Default Academy",
      primaryCurrency: "USD",
      aiEnabled: false,
    },
  })
  console.log(`[phase-1] created Default Academy id=${created.id}`)
  return created
}

function mapLegacyRole(role: string): { academy: AcademyRole; platformOwner: boolean } {
  switch (role) {
    case "ADMIN":
      return { academy: "ACADEMY_ADMIN", platformOwner: true }
    case "INSTRUCTOR":
      return { academy: "COURSE_DEVELOPER", platformOwner: false }
    case "STUDENT":
    default:
      return { academy: "LEARNER", platformOwner: false }
  }
}

async function backfillUsers(academyId: string) {
  const users = await prisma.user.findMany({
    select: { id: true, role: true, name: true, nameToBeCalled: true, certificateName: true, platformRole: true },
  })
  let membershipsCreated = 0
  let platformOwnersSet = 0
  let namesBackfilled = 0

  for (const u of users) {
    const mapped = mapLegacyRole(u.role)

    await prisma.academyMembership.upsert({
      where: { userId_academyId: { userId: u.id, academyId } },
      create: { userId: u.id, academyId, role: mapped.academy },
      update: {},
    })
    membershipsCreated++

    if (mapped.platformOwner && u.platformRole === "NONE") {
      await prisma.user.update({ where: { id: u.id }, data: { platformRole: "PLATFORM_OWNER" } })
      platformOwnersSet++
    }

    const patch: Record<string, string> = {}
    if (!u.nameToBeCalled && u.name) patch.nameToBeCalled = u.name
    if (!u.certificateName && u.name) patch.certificateName = u.name
    if (Object.keys(patch).length > 0) {
      await prisma.user.update({ where: { id: u.id }, data: patch })
      namesBackfilled++
    }
  }

  console.log(`[phase-1] users: ${users.length}, memberships upserted: ${membershipsCreated}, platform owners: ${platformOwnersSet}, names backfilled: ${namesBackfilled}`)
}

async function backfillCourses(academyId: string) {
  const res = await prisma.course.updateMany({
    where: { academyId: null },
    data: { academyId },
  })
  console.log(`[phase-1] courses backfilled with academyId: ${res.count}`)
}

async function main() {
  console.log("[phase-1] starting migration")
  const academy = await ensureDefaultAcademy()
  await backfillUsers(academy.id)
  await backfillCourses(academy.id)

  await audit({
    action: "phase-1.migrate",
    resourceType: "academy",
    resourceId: academy.id,
    metadata: { academySlug: academy.slug },
  })

  console.log("[phase-1] migration complete")
}

main()
  .catch((err) => {
    console.error("[phase-1] FAILED", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
