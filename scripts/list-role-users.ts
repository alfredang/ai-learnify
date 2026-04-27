import { prisma } from "../src/lib/prisma"

async function main() {
  const users = await prisma.user.findMany({
    select: {
      email: true,
      name: true,
      platformRole: true,
      academyMemberships: {
        select: {
          role: true,
          academy: { select: { name: true } },
        },
      },
    },
    take: 20,
  })

  console.log("\nUsers and their roles:\n")
  for (const u of users) {
    const academyMemberships = u.academyMemberships
      .map((m) => `${m.role}@${m.academy.name}`)
      .join(", ")
    console.log(
      `  ${u.email.padEnd(30)} platform=${u.platformRole ?? "—"}  academyMemberships=[${academyMemberships || "—"}]`
    )
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
