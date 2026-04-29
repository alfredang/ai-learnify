"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Settings = {
  platformFeePercent: number
  platformSupportFixedFeeMinor: number
  defaultMarketerCommissionBps: number
  defaultDeveloperSplitBps: number
  minCoursePrice: number
  maxCoursePrice: number
}

interface Props {
  initial: Settings
}

export function PolicyForm({ initial }: Props) {
  const router = useRouter()
  const [s, setS] = useState<Settings>(initial)
  const [saving, setSaving] = useState(false)

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    setS((prev) => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      toast.success("Policy updated")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  const developerPct = (s.defaultDeveloperSplitBps / 100).toFixed(1)
  const academyPct = ((10000 - s.defaultDeveloperSplitBps) / 100).toFixed(1)
  const marketerPct = (s.defaultMarketerCommissionBps / 100).toFixed(1)
  const supportFee = (s.platformSupportFixedFeeMinor / 100).toFixed(2)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Editable rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label="Platform fee (%)"
            hint="Default platform take from every transaction (legacy global rate)"
            suffix="%"
          >
            <Input
              type="number"
              min={0}
              max={100}
              step={1}
              value={s.platformFeePercent}
              onChange={(e) =>
                set("platformFeePercent", parseInt(e.target.value || "0", 10))
              }
            />
          </Field>

          <Field
            label="Platform Support fixed fee"
            hint={`Aggregated per-transaction fee credited to PLATFORM_SUPPORT (${supportFee} per txn)`}
            suffix="cents"
          >
            <Input
              type="number"
              min={0}
              step={1}
              value={s.platformSupportFixedFeeMinor}
              onChange={(e) =>
                set(
                  "platformSupportFixedFeeMinor",
                  parseInt(e.target.value || "0", 10)
                )
              }
            />
          </Field>

          <Field
            label="Default Marketer Commission"
            hint={`Basis points (1bps = 0.01%). Currently ${marketerPct}% of gross.`}
            suffix="bps"
          >
            <Input
              type="number"
              min={0}
              max={10000}
              step={50}
              value={s.defaultMarketerCommissionBps}
              onChange={(e) =>
                set(
                  "defaultMarketerCommissionBps",
                  parseInt(e.target.value || "0", 10)
                )
              }
            />
          </Field>

          <Field
            label="Default Developer split"
            hint={`Basis points credited to DEVELOPER. Currently ${developerPct}% Developer / ${academyPct}% Academy.`}
            suffix="bps"
          >
            <Input
              type="number"
              min={0}
              max={10000}
              step={100}
              value={s.defaultDeveloperSplitBps}
              onChange={(e) =>
                set(
                  "defaultDeveloperSplitBps",
                  parseInt(e.target.value || "0", 10)
                )
              }
            />
          </Field>

          <Field
            label="Minimum course price"
            hint="Floor price developers can charge (in primary currency)"
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={s.minCoursePrice}
              onChange={(e) =>
                set("minCoursePrice", parseFloat(e.target.value || "0"))
              }
            />
          </Field>

          <Field
            label="Maximum course price"
            hint="Ceiling price developers can charge (in primary currency)"
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={s.maxCoursePrice}
              onChange={(e) =>
                set("maxCoursePrice", parseFloat(e.target.value || "0"))
              }
            />
          </Field>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
          <div className="font-medium">Effective split preview</div>
          <p className="text-muted-foreground">
            On a $100 charge: Marketer receives ~${(100 * s.defaultMarketerCommissionBps / 10000).toFixed(2)},
            Platform Support receives ${supportFee},
            of the remainder Developer gets ~{developerPct}% and Academy gets ~{academyPct}%.
            Tax (if any) is collected by the Academy.
          </p>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={save} disabled={saving} size="sm">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save policy
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  hint,
  suffix,
  children,
}: {
  label: string
  hint: string
  suffix?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        {children}
        {suffix && (
          <span className="text-xs text-muted-foreground shrink-0">{suffix}</span>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">{hint}</p>
    </div>
  )
}
