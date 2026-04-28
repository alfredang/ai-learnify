import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AcademyProfileForm } from "./academy-profile-form"
import { LanguagesManager } from "./languages-manager"
import { TaxRatesManager } from "./tax-rates-manager"
import { CpdCatalogManager } from "./cpd-catalog-manager"
import { CertificateRuleForm } from "./certificate-rule-form"

async function resolveAcademyId(userId: string, platformRole: string) {
  if (platformRole === "PLATFORM_OWNER") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, select: { id: true } })
    return a?.id ?? null
  }
  const m = await prisma.academyMembership.findFirst({
    where: { userId, role: "ACADEMY_ADMIN" },
    select: { academyId: true },
  })
  return m?.academyId ?? null
}

export default async function AcademySettingsPage() {
  const session = await auth()
  if (!session?.user) return null
  const academyId = await resolveAcademyId(
    session.user.id,
    session.user.platformRole ?? "NONE"
  )
  if (!academyId) {
    return (
      <div className="container py-12 max-w-3xl">
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No academy for this account.
          </CardContent>
        </Card>
      </div>
    )
  }

  const [academy, rule, taxRates, cpd] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: academyId },
      select: {
        id: true,
        name: true,
        slug: true,
        brandingLogoUrl: true,
        secondaryLogoUrl: true,
        primaryCurrency: true,
        taxJurisdiction: true,
        taxRegistrationNumber: true,
        aiEnabled: true,
        bannerRotationMs: true,
        supportedLanguages: true,
        defaultDeveloperSplitBps: true,
      },
    }),
    prisma.certificateRule.findFirst({ where: { academyId, isActive: true } }),
    prisma.taxRate.findMany({
      where: { academyId },
      orderBy: [{ isActive: "desc" }, { jurisdiction: "asc" }, { appliesFrom: "desc" }],
    }),
    prisma.cpdCatalog.findMany({
      where: { academyId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ])

  if (!academy) return null

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §4 step 2 — branding, languages, currency, tax, AI, CPD,
          certification thresholds and the default author revenue split.
        </p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Academy</TabsTrigger>
          <TabsTrigger value="languages">Languages</TabsTrigger>
          <TabsTrigger value="tax">Tax</TabsTrigger>
          <TabsTrigger value="cpd">CPD</TabsTrigger>
          <TabsTrigger value="cert">Certification</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-6">
          <AcademyProfileForm
            initial={JSON.parse(JSON.stringify(academy))}
          />
        </TabsContent>

        <TabsContent value="languages" className="mt-6">
          <LanguagesManager
            initial={academy.supportedLanguages}
          />
        </TabsContent>

        <TabsContent value="tax" className="mt-6">
          <TaxRatesManager
            initialRates={JSON.parse(JSON.stringify(taxRates))}
          />
        </TabsContent>

        <TabsContent value="cpd" className="mt-6">
          <CpdCatalogManager
            initialEntries={JSON.parse(JSON.stringify(cpd))}
          />
        </TabsContent>

        <TabsContent value="cert" className="mt-6">
          <CertificateRuleForm
            initial={
              rule
                ? {
                    minContentPct: rule.minContentPct,
                    minAssessmentPct: rule.minAssessmentPct,
                    requiresSurvey: rule.requiresSurvey,
                    mustBeBeforeExpiry: rule.mustBeBeforeExpiry,
                  }
                : null
            }
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
