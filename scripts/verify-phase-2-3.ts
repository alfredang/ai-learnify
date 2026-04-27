import { prisma } from "../src/lib/prisma"

async function main() {
  const academyCount = await prisma.academy.count()
  const sectorCount = await prisma.sector.count()
  const cpdCount = await prisma.cpdCatalog.count()
  const bannerCount = await prisma.banner.count({ where: { isActive: true } })
  const programmeCount = await prisma.programme.count()
  const grantCount = await prisma.accessGrant.count({ where: { isActive: true } })

  console.log("=== Phase 2+3 state ===")
  console.log(`Academies:            ${academyCount}`)
  console.log(`Sectors (all):        ${sectorCount}`)
  console.log(`CPD catalog entries:  ${cpdCount}`)
  console.log(`Active banners:       ${bannerCount}`)
  console.log(`Programmes:           ${programmeCount}`)
  console.log(`Active AccessGrants:  ${grantCount}`)

  const grantsByType = await prisma.accessGrant.groupBy({
    by: ["productType"],
    _count: { _all: true },
    where: { isActive: true },
  })
  console.log("\nGrants by productType:")
  for (const g of grantsByType) {
    console.log(`  ${g.productType}: ${g._count._all}`)
  }

  const expiring = await prisma.accessGrant.findMany({
    where: { isActive: true, productType: "COURSE" },
    select: { userId: true, courseId: true, grantedAt: true, expiresAt: true },
    orderBy: { expiresAt: "asc" },
    take: 3,
  })
  console.log("\nSample COURSE grants (next 3 to expire):")
  for (const g of expiring) {
    const days = Math.round((g.expiresAt.getTime() - Date.now()) / 86_400_000)
    const courseTag = g.courseId ? g.courseId.slice(-6) : "—"
    console.log(`  user=${g.userId.slice(-6)} course=${courseTag} expires in ${days}d`)
  }

  const bestComplimentary = await prisma.programme.findFirst({
    where: { isFree: true, status: "PUBLISHED" },
    select: { title: true, slug: true, accessDurationDays: true, _count: { select: { accessGrants: true } } },
  })
  console.log("\nComplimentary Programme:")
  console.dir(bestComplimentary, { depth: null })

  const coursePartners = await prisma.course.findMany({
    where: { status: "PUBLISHED" },
    select: { partnerName: true, cpdCatalogId: true, sectorId: true },
    take: 5,
  })
  console.log("\nSample 5 courses — partner/cpd/sector linkage:")
  for (const c of coursePartners) {
    console.log(`  partner=${c.partnerName ?? "∅"} cpd=${c.cpdCatalogId ? "set" : "∅"} sector=${c.sectorId ? "set" : "∅"}`)
  }
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
