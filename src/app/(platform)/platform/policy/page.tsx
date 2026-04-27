import { prisma } from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Lock } from "lucide-react"

export default async function PlatformPolicyPage() {
  const settings = await prisma.platformSettings.findFirst()

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Monetisation policy</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Spec §6 step 2. Configurable defaults applied platform-wide.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current values</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row
              label="Platform fee (%)"
              value={`${settings?.platformFeePercent ?? 30}%`}
              hint="Default platform take from every transaction"
            />
            <Row
              label="Minimum course price"
              value={`${Number(settings?.minCoursePrice ?? 0).toFixed(2)}`}
              hint="Floor price instructors can charge"
            />
            <Row
              label="Maximum course price"
              value={`${Number(settings?.maxCoursePrice ?? 999.99).toFixed(2)}`}
              hint="Ceiling price instructors can charge"
            />
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coming in Phase 4</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-1">
            <p>• Platform Support fixed fee (per transaction)</p>
            <p>• Default marketer commission %</p>
            <p>• Default Academy / Developer split (default 50/50)</p>
            <p>• Promo code CRUD + marketer attribution</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <span className="font-mono text-sm">{value}</span>
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
