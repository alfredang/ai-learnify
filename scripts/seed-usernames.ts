import { prisma } from "../src/lib/prisma"

// Spec §3.2 — non-learner roles can log in via Username OR Email.
// Seed usernames for the test accounts so the feature is demoable.
const usernames: Array<{ email: string; username: string }> = [
  { email: "admin@learnify.com", username: "alfred" },
  { email: "john@learnify.com", username: "john" },
  { email: "sarah@learnify.com", username: "sarah" },
  { email: "mike@learnify.com", username: "mike" },
  { email: "marketer@learnify.com", username: "maya" },
]

async function main() {
  for (const { email, username } of usernames) {
    await prisma.user.update({
      where: { email },
      data: { username },
    })
    console.log(`  ${email.padEnd(30)} → username '${username}'`)
  }
  console.log(`\nSet ${usernames.length} usernames.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
