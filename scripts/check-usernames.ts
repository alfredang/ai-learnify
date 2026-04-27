import { prisma } from "../src/lib/prisma"

async function main() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true, username: true, platformRole: true, academyMemberships: { select: { role: true } } },
    take: 20,
  })

  console.log("\nUsername status by role:\n")
  for (const u of users) {
    const roles = [
      u.platformRole !== "NONE" ? u.platformRole : null,
      ...u.academyMemberships.map((m) => m.role),
    ].filter(Boolean).join(", ")
    const isLearnerOnly = roles === "LEARNER"
    const needs = !isLearnerOnly && !u.username ? " ⚠ needs one (spec §3.2)" : ""
    console.log(`  ${u.email.padEnd(30)} username=${(u.username ?? "—").padEnd(20)} roles=[${roles}]${needs}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
