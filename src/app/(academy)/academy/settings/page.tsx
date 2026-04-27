import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

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
  if (!academyId) return null

  const [academy, rule, template, sectorCount, cpdCount] = await Promise.all([
    prisma.academy.findUnique({
      where: { id: academyId },
      select: { id: true, name: true, slug: true, primaryCurrency: true, taxJurisdiction: true, aiEnabled: true },
    }),
    prisma.certificateRule.findFirst({ where: { academyId, isActive: true } }),
    prisma.certificateTemplate.findFirst({ where: { academyId, isDefault: true } }),
    prisma.sector.count({ where: { academyId } }),
    prisma.cpdCatalog.count({ where: { academyId } }),
  ])

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §4 step 2 configuration. Mutation UI ships in a later phase —
          current values shown here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Academy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={academy?.name ?? "—"} />
            <Row label="Slug" value={academy?.slug ?? "—"} />
            <Row label="Currency" value={academy?.primaryCurrency ?? "USD"} />
            <Row label="Tax jurisdiction" value={academy?.taxJurisdiction ?? "—"} />
            <Row
              label="Gen-AI authoring"
              value={
                <Badge variant={academy?.aiEnabled ? "default" : "outline"}>
                  {academy?.aiEnabled ? "Enabled" : "Disabled"}
                </Badge>
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certification rule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Min content completion" value={`${rule?.minContentPct ?? 50}%`} />
            <Row label="Min assessment score" value={`${rule?.minAssessmentPct ?? 80}%`} />
            <Row
              label="Survey required"
              value={rule?.requiresSurvey ?? true ? "Yes" : "No"}
            />
            <Row
              label="Must be before expiry"
              value={rule?.mustBeBeforeExpiry ?? true ? "Yes" : "No"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certificate template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Template" value={template?.name ?? "—"} />
            <Row label="Primary logo" value={template?.primaryLogoUrl ?? "—"} />
            <Row label="Signatory" value={template?.signatoryName ?? "—"} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catalogue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Sectors" value={sectorCount} />
            <Row label="CPD entries" value={cpdCount} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
