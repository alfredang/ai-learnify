import bcrypt from "bcryptjs"
import { prisma } from "../src/lib/prisma"

async function main() {
  const academy = await prisma.academy.findFirst({ where: { name: "Default Academy" } })
  if (!academy) throw new Error("Default Academy not found")

  const password = await bcrypt.hash("password123", 10)

  const marketer = await prisma.user.upsert({
    where: { email: "marketer@learnify.com" },
    update: {},
    create: {
      email: "marketer@learnify.com",
      name: "Maya the Marketer",
      password,
      role: "STUDENT",
      platformRole: "NONE",
    },
  })

  await prisma.academyMembership.upsert({
    where: {
      userId_academyId_role: {
        userId: marketer.id,
        academyId: academy.id,
        role: "MARKETER",
      },
    },
    update: {},
    create: { userId: marketer.id, academyId: academy.id, role: "MARKETER" },
  })

  console.log(`marketer@learnify.com / password123 — MARKETER on ${academy.name}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
