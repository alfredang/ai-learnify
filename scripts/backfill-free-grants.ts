import { prisma } from "../src/lib/prisma"
import { grantCourseAccess } from "../src/lib/access"

async function main() {
  // Find every Enrollment that doesn't have a corresponding AccessGrant
  // for the same user + course. These are mostly the free-enrolment rows
  // created before the access-grant fix.
  const enrollments = await prisma.enrollment.findMany({
    select: { userId: true, courseId: true },
  })

  let fixed = 0
  for (const e of enrollments) {
    const grant = await prisma.accessGrant.findFirst({
      where: { userId: e.userId, courseId: e.courseId },
    })
    if (!grant) {
      await grantCourseAccess(e.userId, e.courseId)
      fixed++
      console.log(`  + granted ${e.userId} → ${e.courseId}`)
    }
  }

  console.log(`Backfilled ${fixed} missing AccessGrant${fixed === 1 ? "" : "s"}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
