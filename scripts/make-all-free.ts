import { prisma } from "../src/lib/prisma"

async function main() {
  const result = await prisma.course.updateMany({
    where: { isFree: false },
    data: { isFree: true, price: 0, discountPrice: null },
  })
  console.log(`Flipped ${result.count} courses to free.`)

  const programmes = await prisma.programme.updateMany({
    where: { price: { gt: 0 } },
    data: { price: 0 },
  })
  console.log(`Zeroed price on ${programmes.count} programmes.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
