"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Loader2 } from "lucide-react"

type RuleInitial = {
  minContentPct: number
  minAssessmentPct: number
  requiresSurvey: boolean
  mustBeBeforeExpiry: boolean
} | null

interface Props {
  initial: RuleInitial
}

export function CertificateRuleForm({ initial }: Props) {
  const router = useRouter()
  const [minContentPct, setMinContentPct] = useState(String(initial?.minContentPct ?? 50))
  const [minAssessmentPct, setMinAssessmentPct] = useState(
    String(initial?.minAssessmentPct ?? 80)
  )
  const [requiresSurvey, setRequiresSurvey] = useState(initial?.requiresSurvey ?? true)
  const [mustBeBeforeExpiry, setMustBeBeforeExpiry] = useState(
    initial?.mustBeBeforeExpiry ?? true
  )
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const content = parseInt(minContentPct, 10)
      const assessment = parseInt(minAssessmentPct, 10)
      if (Number.isNaN(content) || content < 0 || content > 100) {
        throw new Error("Content % must be 0–100")
      }
      if (Number.isNaN(assessment) || assessment < 0 || assessment > 100) {
        throw new Error("Assessment % must be 0–100")
      }
      const res = await fetch("/api/academy/certificate-rule", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minContentPct: content,
          minAssessmentPct: assessment,
          requiresSurvey,
          mustBeBeforeExpiry,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      toast.success("Certification rule saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h2 className="font-semibold text-sm">Certification thresholds</h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            Spec §12 — thresholds the certification engine evaluates on every
            progress, quiz and survey event. Defaults are 50% / 80% / survey
            required / before expiry.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Min content completion (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={minContentPct}
              onChange={(e) => setMinContentPct(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Min assessment score (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              value={minAssessmentPct}
              onChange={(e) => setMinAssessmentPct(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between border rounded-md p-3">
          <div>
            <div className="text-sm font-medium">Mandatory survey</div>
            <p className="text-[11px] text-muted-foreground">
              Adds the course-level survey as a required gate before a
              certificate is issued.
            </p>
          </div>
          <Switch checked={requiresSurvey} onCheckedChange={setRequiresSurvey} />
        </div>

        <div className="flex items-center justify-between border rounded-md p-3">
          <div>
            <div className="text-sm font-medium">Must complete before access expiry</div>
            <p className="text-[11px] text-muted-foreground">
              Spec §11.1 — locks certification to the 90-day access window.
            </p>
          </div>
          <Switch
            checked={mustBeBeforeExpiry}
            onCheckedChange={setMustBeBeforeExpiry}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save rule
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
