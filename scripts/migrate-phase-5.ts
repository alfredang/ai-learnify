/**
 * Phase 5 migration — idempotent.
 *
 * - Creates the default CertificateRule per Academy (spec §12 defaults:
 *   ≥50% content, ≥80% assessment, survey required, before expiry).
 * - Creates a default CertificateTemplate per Academy if none exists.
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const academies = await prisma.academy.findMany({ select: { id: true, name: true, slug: true, brandingLogoUrl: true } })

  for (const a of academies) {
    const existingRule = await prisma.certificateRule.findFirst({
      where: { academyId: a.id, isActive: true },
    })
    if (!existingRule) {
      await prisma.certificateRule.create({
        data: {
          academyId: a.id,
          minContentPct: 50,
          minAssessmentPct: 80,
          requiresSurvey: true,
          mustBeBeforeExpiry: true,
          isActive: true,
        },
      })
      console.log(`[phase-5] default rule created for ${a.slug}`)
    }

    const existingTpl = await prisma.certificateTemplate.findFirst({
      where: { academyId: a.id, isDefault: true },
    })
    if (!existingTpl) {
      await prisma.certificateTemplate.create({
        data: {
          academyId: a.id,
          name: `${a.name} default template`,
          primaryLogoUrl: a.brandingLogoUrl,
          signatoryName: a.name,
          signatoryTitle: "Academy",
          layoutJson: { theme: "classic", accentColor: "#1a365d" },
          isDefault: true,
        },
      })
      console.log(`[phase-5] default template created for ${a.slug}`)
    }
  }

  console.log("[phase-5] migration complete")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
