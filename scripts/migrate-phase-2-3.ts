/**
 * Phase 2 + 3 migration — idempotent.
 *
 * Phase 2:
 *   - Seed a small default catalogue of Sectors and CPD entries per Academy.
 *   - Seed one example Banner per Academy for the advertising carousel.
 *
 * Phase 3:
 *   - Create a Complimentary Programme per Academy (free-content bucket).
 *   - For every existing Enrollment create an AccessGrant with a 90-day
 *     window starting at the enrollment's createdAt.
 *   - For every existing learner create a Complimentary AccessGrant
 *     so they see the Complimentary Programme tab immediately.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const SECTORS = [
  { name: "Technology", slug: "technology" },
  { name: "Business & Finance", slug: "business-finance" },
  { name: "Healthcare", slug: "healthcare" },
  { name: "Creative & Design", slug: "creative-design" },
  { name: "Personal Development", slug: "personal-development" },
]

const CPD_ENTRIES = [
  { name: "General CPD", points: 1, sortOrder: 10 },
  { name: "Technical CPD", points: 2, sortOrder: 20 },
  { name: "Professional CPD", points: 3, sortOrder: 30 },
]

const FAR_FUTURE = new Date("2099-12-31T23:59:59Z")

function addDays(d: Date, days: number): Date {
  const copy = new Date(d.getTime())
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

async function seedSectors(academyId: string) {
  for (const s of SECTORS) {
    await prisma.sector.upsert({
      where: { academyId_slug: { academyId, slug: s.slug } },
      create: { ...s, academyId },
      update: { name: s.name },
    })
  }
}

async function seedCpd(academyId: string) {
  for (const c of CPD_ENTRIES) {
    const existing = await prisma.cpdCatalog.findFirst({
      where: { academyId, name: c.name },
    })
    if (existing) continue
    await prisma.cpdCatalog.create({ data: { ...c, academyId } })
  }
}

async function seedBanner(academyId: string) {
  const count = await prisma.banner.count({ where: { academyId } })
  if (count > 0) return
  await prisma.banner.create({
    data: {
      academyId,
      imageUrl:
        "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1600&q=80",
      title: "Learn new skills. Advance your career.",
      targetUrl: "/courses",
      placement: "CAROUSEL_TOP",
      position: 0,
      rotationWeight: 1,
      isActive: true,
    },
  })
}

async function ensureComplimentaryProgramme(academyId: string) {
  const slug = `complimentary-${academyId.slice(-6)}`
  const existing = await prisma.programme.findUnique({ where: { slug } })
  if (existing) return existing
  const created = await prisma.programme.create({
    data: {
      academyId,
      slug,
      title: "Complimentary Programme",
      subtitle: "Free event recordings & reference materials",
      description:
        "Available to every registered learner at no cost. Watch event videos and download materials. No expiry, no certificate.",
      price: 0,
      currency: "USD",
      isFree: true,
      status: "PUBLISHED",
      publishedAt: new Date(),
      // Complimentary content has no expiry (spec §6.1). We implement this
      // by granting access far into the future rather than special-casing
      // the AccessGrant model.
      accessDurationDays: 36500,
    },
  })
  console.log(`[phase-2-3] created Complimentary Programme for academy ${academyId}`)
  return created
}

async function backfillEnrollmentsToGrants() {
  const enrollments = await prisma.enrollment.findMany({
    select: {
      id: true,
      userId: true,
      courseId: true,
      createdAt: true,
      course: { select: { accessDurationDays: true } },
    },
  })

  let created = 0
  for (const e of enrollments) {
    const existing = await prisma.accessGrant.findFirst({
      where: { userId: e.userId, courseId: e.courseId },
    })
    if (existing) continue

    const durationDays = e.course.accessDurationDays ?? 90
    await prisma.accessGrant.create({
      data: {
        userId: e.userId,
        productType: "COURSE",
        courseId: e.courseId,
        grantedAt: e.createdAt,
        // Existing learners predate the 90-day rule. Give them the duration
        // from createdAt, but never expire them retroactively — clamp to
        // today if that's already in the past.
        expiresAt: (() => {
          const natural = addDays(e.createdAt, durationDays)
          const today = new Date()
          return natural > today ? natural : addDays(today, durationDays)
        })(),
        source: "MIGRATION",
        isActive: true,
      },
    })
    created++
  }
  console.log(`[phase-2-3] AccessGrants created from Enrollments: ${created} / ${enrollments.length}`)
}

async function grantComplimentaryToAllLearners(programmeId: string) {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
  })
  let created = 0
  for (const u of users) {
    const existing = await prisma.accessGrant.findFirst({
      where: { userId: u.id, programmeId },
    })
    if (existing) continue
    await prisma.accessGrant.create({
      data: {
        userId: u.id,
        programmeId,
        productType: "COMPLIMENTARY",
        source: "COMPLIMENTARY",
        grantedAt: new Date(),
        expiresAt: FAR_FUTURE,
        isActive: true,
      },
    })
    created++
  }
  console.log(`[phase-2-3] Complimentary grants: ${created} / ${users.length}`)
}

async function main() {
  console.log("[phase-2-3] starting migration")
  const academies = await prisma.academy.findMany({ select: { id: true, slug: true } })

  for (const a of academies) {
    console.log(`[phase-2-3] academy ${a.slug} (${a.id})`)
    await seedSectors(a.id)
    await seedCpd(a.id)
    await seedBanner(a.id)
    const prog = await ensureComplimentaryProgramme(a.id)
    await grantComplimentaryToAllLearners(prog.id)
  }

  await backfillEnrollmentsToGrants()

  console.log("[phase-2-3] migration complete")
}

main()
  .catch((err) => {
    console.error("[phase-2-3] FAILED", err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
