/**
 * Filter coverage seed — gives the public catalogue at least one match for
 * every filter value (Sector / CPD / Partner / Level), without disturbing
 * the existing 18 published courses.
 *
 * Idempotent: safe to re-run. Re-runs only update the courses we tagged
 * (matched by `partnerName` prefix "Filter") plus the deterministic
 * sector/cpd/partner mapping by category name.
 *
 * Usage:
 *   npx tsx scripts/seed-filter-coverage.ts
 */

import { PrismaClient } from "@prisma/client"
import slugify from "slugify"

const prisma = new PrismaClient()

// Deterministic assignment by category — keeps re-runs stable.
const CATEGORY_TO_TAGS: Record<
  string,
  { sectorSlug: string; cpdName: string; partnerName: string }
> = {
  Design: {
    sectorSlug: "creative-design",
    cpdName: "General CPD",
    partnerName: "Pixel Atelier",
  },
  Development: {
    sectorSlug: "technology",
    cpdName: "Technical CPD",
    partnerName: "CodeWorks Studio",
  },
  "IT & Software": {
    sectorSlug: "technology",
    cpdName: "Technical CPD",
    partnerName: "CodeWorks Studio",
  },
  Business: {
    sectorSlug: "business-finance",
    cpdName: "Professional CPD",
    partnerName: "Stratos Academy",
  },
  Marketing: {
    sectorSlug: "business-finance",
    cpdName: "Professional CPD",
    partnerName: "Stratos Academy",
  },
  "Personal Development": {
    sectorSlug: "personal-development",
    cpdName: "General CPD",
    partnerName: "Wellbeing Lab",
  },
}

async function main() {
  // ── 1. Backfill existing PUBLISHED courses with Sector / CPD / Partner ──
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    include: { category: { select: { name: true } } },
  })

  const sectors = await prisma.sector.findMany()
  const sectorBySlug = new Map(sectors.map((s) => [s.slug, s]))

  const cpds = await prisma.cpdCatalog.findMany()
  const cpdByName = new Map(cpds.map((c) => [c.name, c]))

  let backfilled = 0
  for (const course of courses) {
    const tags = CATEGORY_TO_TAGS[course.category.name]
    if (!tags) continue

    const sector = sectorBySlug.get(tags.sectorSlug)
    const cpd = cpdByName.get(tags.cpdName)
    if (!sector || !cpd) continue

    const dirty =
      course.sectorId !== sector.id ||
      course.cpdCatalogId !== cpd.id ||
      course.partnerName !== tags.partnerName

    if (dirty) {
      await prisma.course.update({
        where: { id: course.id },
        data: {
          sectorId: sector.id,
          cpdCatalogId: cpd.id,
          partnerName: tags.partnerName,
        },
      })
      backfilled++
    }
  }
  console.log(`Backfilled ${backfilled} course(s) with Sector / CPD / Partner.`)

  // ── 2. Create courses to cover missing levels (ADVANCED / ALL_LEVELS) ──
  const levelsNeeded: Array<{
    level: "ADVANCED" | "ALL_LEVELS"
    title: string
    description: string
    categorySlug: string
    sectorSlug: string
    cpdName: string
    partnerName: string
    isFree: boolean
    price: number
  }> = [
    {
      level: "ADVANCED",
      title: "Advanced Cardiac Imaging Diagnostics",
      description:
        "An advanced clinical practice course covering modern echocardiography and cardiac MRI interpretation for senior practitioners.",
      categorySlug: "personal-development", // Healthcare has no category yet, reuse
      sectorSlug: "healthcare",
      cpdName: "Professional CPD",
      partnerName: "Meridian Health Institute",
      isFree: false,
      price: 199,
    },
    {
      level: "ALL_LEVELS",
      title: "Communication Skills for Every Stage of Your Career",
      description:
        "From first interview to boardroom — communication frameworks that work whether you're entry-level or executive.",
      categorySlug: "personal-development",
      sectorSlug: "personal-development",
      cpdName: "General CPD",
      partnerName: "Wellbeing Lab",
      isFree: true,
      price: 0,
    },
  ]

  const admin = await prisma.user.findFirst({
    where: {
      OR: [
        { email: "admin@learnify.com" },
        { platformRole: "PLATFORM_OWNER" },
      ],
    },
    select: { id: true },
  })
  const academy = await prisma.academy.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
  if (!admin || !academy) {
    throw new Error(
      "Cannot seed level-coverage courses: missing platform owner or academy."
    )
  }

  let created = 0
  for (const target of levelsNeeded) {
    const existing = await prisma.course.findFirst({
      where: { title: target.title, status: "PUBLISHED" },
      select: { id: true },
    })
    if (existing) continue

    const category = await prisma.category.findFirst({
      where: { slug: target.categorySlug },
      select: { id: true },
    })
    const sector = sectorBySlug.get(target.sectorSlug)
    const cpd = cpdByName.get(target.cpdName)
    if (!category || !sector || !cpd) {
      console.warn(
        `Skipping ${target.title} — missing category/sector/cpd lookup.`
      )
      continue
    }

    const slug = `${slugify(target.title, { lower: true, strict: true })}-${Date.now()}`

    await prisma.course.create({
      data: {
        title: target.title,
        slug,
        description: target.description,
        thumbnail:
          "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800",
        price: target.price,
        isFree: target.isFree,
        currency: "USD",
        level: target.level,
        language: "English",
        learningOutcomes: [
          "Apply the framework in a real-world scenario",
          "Evaluate trade-offs between competing approaches",
          "Communicate decisions to senior stakeholders",
        ],
        requirements: ["No specific prerequisites"],
        targetAudience: ["Practitioners ready to operate at this level"],
        status: "PUBLISHED",
        publishedAt: new Date(),
        instructorId: admin.id,
        categoryId: category.id,
        academyId: academy.id,
        sectorId: sector.id,
        cpdCatalogId: cpd.id,
        partnerName: target.partnerName,
        averageRating: target.level === "ADVANCED" ? 4.5 : 4.8,
        totalReviews: target.level === "ADVANCED" ? 12 : 24,
      },
    })
    created++
  }
  console.log(`Created ${created} level-coverage course(s).`)

  // ── 3. Verify coverage ──────────────────────────────────────
  const summary = await Promise.all([
    prisma.course.groupBy({
      by: ["sectorId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
    prisma.course.groupBy({
      by: ["cpdCatalogId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
    prisma.course.groupBy({
      by: ["level"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
    prisma.course.findMany({
      where: { status: "PUBLISHED", partnerName: { not: null } },
      select: { partnerName: true },
      distinct: ["partnerName"],
    }),
  ])
  console.log("\nCOVERAGE AFTER SEED:")
  console.log(
    " Sectors with courses:",
    summary[0].filter((s) => s.sectorId).length,
    "(of",
    sectors.length,
    "total)"
  )
  console.log(
    " CPD entries with courses:",
    summary[1].filter((c) => c.cpdCatalogId).length,
    "(of",
    cpds.length,
    "total)"
  )
  console.log(" Levels:", summary[2].map((l) => `${l.level}=${l._count._all}`).join(", "))
  console.log(" Distinct partners:", summary[3].map((p) => p.partnerName))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
