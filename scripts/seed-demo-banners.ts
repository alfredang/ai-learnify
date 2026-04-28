import { prisma } from "../src/lib/prisma"

const DEMO_BANNERS = [
  {
    title: "Master New Skills with Expert-Led Courses",
    imageUrl:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=2000&q=80",
    targetUrl: "/courses",
  },
  {
    title: "Learn at Your Own Pace — 90 Days of Access",
    imageUrl:
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=2000&q=80",
    targetUrl: "/courses",
  },
  {
    title: "Earn Certificates That Showcase Your Achievements",
    imageUrl:
      "https://images.unsplash.com/photo-1606761568499-6d2451b23c66?auto=format&fit=crop&w=2000&q=80",
    targetUrl: "/courses",
  },
]

async function main() {
  const academy = await prisma.academy.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      slug: "default",
      name: "Default Academy",
      primaryCurrency: "USD",
      aiEnabled: false,
    },
  })

  const existing = await prisma.banner.count({ where: { academyId: academy.id } })
  if (existing > 0) {
    console.log(
      `[seed-demo-banners] ${existing} banner(s) already exist for ${academy.name} — skipping. Delete them first if you want to reseed.`
    )
    return
  }

  for (let i = 0; i < DEMO_BANNERS.length; i++) {
    const b = DEMO_BANNERS[i]
    await prisma.banner.create({
      data: {
        academyId: academy.id,
        imageUrl: b.imageUrl,
        title: b.title,
        targetUrl: b.targetUrl,
        position: i,
        isActive: true,
      },
    })
  }

  console.log(
    `[seed-demo-banners] inserted ${DEMO_BANNERS.length} demo banners on ${academy.name}.`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
