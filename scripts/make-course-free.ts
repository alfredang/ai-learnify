import { prisma } from "../src/lib/prisma"

async function main() {
  const courses = await prisma.course.findMany({
    where: { title: { contains: "Introduction to Programming", mode: "insensitive" } },
    select: { id: true, title: true, slug: true, price: true, isFree: true },
  })

  if (courses.length === 0) {
    console.log("No course found matching 'Introduction to Programming'")
    return
  }

  for (const c of courses) {
    console.log(`Found: ${c.title} (${c.slug}) — was price=${c.price}, isFree=${c.isFree}`)
    await prisma.course.update({
      where: { id: c.id },
      data: { isFree: true, price: 0, discountPrice: null },
    })
    console.log(`  → updated to free`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(() => prisma.$disconnect())
