import { isEnabled, setFlag, invalidateFeatureFlagCache } from "../src/lib/feature-flags"
import { audit } from "../src/lib/audit"
import { prisma } from "../src/lib/prisma"

async function main() {
  console.log("[phase-0] feature flag round-trip...")
  await setFlag("p0-smoke", true, { description: "Phase 0 smoke test" })
  const global = await isEnabled("p0-smoke")
  console.log(`  global enabled = ${global}`)
  if (!global) throw new Error("expected global flag to be enabled")

  await setFlag("p0-smoke", false, { academyId: "acme" })
  invalidateFeatureFlagCache()
  const scoped = await isEnabled("p0-smoke", { academyId: "acme" })
  console.log(`  acme scoped enabled = ${scoped}`)
  if (scoped) throw new Error("expected acme override to be disabled")

  console.log("[phase-0] audit write...")
  await audit({
    action: "phase-0.smoke",
    resourceType: "system",
    metadata: { runAt: new Date().toISOString() },
  })
  const count = await prisma.auditLog.count({ where: { action: "phase-0.smoke" } })
  console.log(`  audit rows for action=phase-0.smoke: ${count}`)
  if (count < 1) throw new Error("audit row not written")

  console.log("[phase-0] OK")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
