import { prisma } from "../src/lib/prisma"

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "phase1-tester@example.com" },
    select: {
      email: true,
      nameToBeCalled: true,
      certificateName: true,
      certificateIdNumber: true,
      role: true,
      platformRole: true,
      isActive: true,
      academyMemberships: {
        select: {
          role: true,
          academy: { select: { slug: true, name: true } },
        },
      },
    },
  })
  console.log("New Phase 1 learner:")
  console.dir(user, { depth: null })

  const adminUser = await prisma.user.findUnique({
    where: { email: "admin@learnify.com" },
    select: {
      email: true,
      role: true,
      platformRole: true,
      nameToBeCalled: true,
      certificateName: true,
      academyMemberships: {
        select: { role: true, academy: { select: { slug: true } } },
      },
    },
  })
  console.log("\nBackfilled admin:")
  console.dir(adminUser, { depth: null })

  const tallyByRole = await prisma.academyMembership.groupBy({
    by: ["role"],
    _count: { _all: true },
  })
  console.log("\nMembership counts by role:")
  for (const row of tallyByRole) {
    console.log(`  ${row.role}: ${row._count._all}`)
  }

  const courseCoverage = await prisma.course.count({ where: { academyId: null } })
  console.log(`\nCourses with null academyId (should be 0): ${courseCoverage}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
