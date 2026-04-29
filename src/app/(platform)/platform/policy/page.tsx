import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Lock } from "lucide-react"
import { PolicyForm } from "./policy-form"

export default async function PlatformPolicyPage() {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/platform/policy")
  if (session.user.platformRole !== "PLATFORM_OWNER") redirect("/platform/ops")

  let settings = await prisma.platformSettings.findFirst()
  if (!settings) {
    settings = await prisma.platformSettings.create({ data: {} })
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monetisation policy</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §6. Platform-wide defaults applied across all academies — every
          change is audited.
        </p>
      </div>

      <PolicyForm
        initial={{
          platformFeePercent: settings.platformFeePercent,
          platformSupportFixedFeeMinor: settings.platformSupportFixedFeeMinor,
          defaultMarketerCommissionBps: settings.defaultMarketerCommissionBps,
          defaultDeveloperSplitBps: settings.defaultDeveloperSplitBps,
          minCoursePrice: Number(settings.minCoursePrice),
          maxCoursePrice: Number(settings.maxCoursePrice),
        }}
      />

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Locked rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Locked label="Learning model" value="Self-paced, asynchronous only" />
          <Locked label="Manual grading" value="Not permitted (§1.2)" />
          <Locked
            label="Certification thresholds"
            value="Content ≥50%, Assessment ≥80%, Survey required, Before expiry"
          />
          <Locked label="Access window" value="90 days (§11.1)" />
          <Badge variant="outline" className="mt-2">
            These cannot be changed from the UI — by design.
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span>{label}</span>
      <span className="text-xs font-mono text-muted-foreground">{value}</span>
    </div>
  )
}
