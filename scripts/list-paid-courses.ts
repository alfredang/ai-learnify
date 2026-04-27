import { prisma } from "../src/lib/prisma"

async function main() {
  const courses = await prisma.course.findMany({
    where: { isFree: false, status: "PUBLISHED" },
    select: { id: true, title: true, slug: true, price: true, currency: true, academyId: true },
    take: 10,
  })
  console.log(`Found ${courses.length} paid published course(s):`)
  for (const c of courses) {
    console.log(`  • ${c.title} — ${c.currency} ${c.price} (slug: ${c.slug}, academy: ${c.academyId ?? "none"})`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
