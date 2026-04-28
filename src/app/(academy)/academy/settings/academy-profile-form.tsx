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

type AcademyInitial = {
  id: string
  name: string
  slug: string
  brandingLogoUrl: string | null
  secondaryLogoUrl: string | null
  primaryCurrency: string
  taxJurisdiction: string | null
  taxRegistrationNumber: string | null
  aiEnabled: boolean
  bannerRotationMs: number
  defaultDeveloperSplitBps: number
}

interface Props {
  initial: AcademyInitial
}

export function AcademyProfileForm({ initial }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [brandingLogoUrl, setBrandingLogoUrl] = useState(initial.brandingLogoUrl ?? "")
  const [secondaryLogoUrl, setSecondaryLogoUrl] = useState(initial.secondaryLogoUrl ?? "")
  const [primaryCurrency, setPrimaryCurrency] = useState(initial.primaryCurrency)
  const [taxJurisdiction, setTaxJurisdiction] = useState(initial.taxJurisdiction ?? "")
  const [taxRegistrationNumber, setTaxRegistrationNumber] = useState(
    initial.taxRegistrationNumber ?? ""
  )
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled)
  const [bannerRotationMs, setBannerRotationMs] = useState(String(initial.bannerRotationMs))
  const [splitPct, setSplitPct] = useState(((initial.defaultDeveloperSplitBps / 100) || 50).toFixed(1))
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const splitBps = Math.round(parseFloat(splitPct || "50") * 100)
      const rotationMs = parseInt(bannerRotationMs, 10)
      if (Number.isNaN(rotationMs) || rotationMs < 1500) {
        throw new Error("Rotation interval must be ≥ 1500 ms")
      }
      const res = await fetch("/api/academy/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          brandingLogoUrl: brandingLogoUrl.trim() || null,
          secondaryLogoUrl: secondaryLogoUrl.trim() || null,
          primaryCurrency: primaryCurrency.trim().toUpperCase(),
          taxJurisdiction: taxJurisdiction.trim() || null,
          taxRegistrationNumber: taxRegistrationNumber.trim() || null,
          aiEnabled,
          bannerRotationMs: rotationMs,
          defaultDeveloperSplitBps: splitBps,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      toast.success("Settings saved")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-semibold text-sm">Identity</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Academy name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="text-xs">Slug</Label>
              <Input value={initial.slug} disabled />
              <p className="text-[11px] text-muted-foreground mt-1">
                Slug is immutable — contact platform support to change.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Primary logo URL</Label>
              <Input
                value={brandingLogoUrl}
                onChange={(e) => setBrandingLogoUrl(e.target.value)}
                placeholder="https://res.cloudinary.com/..."
              />
            </div>
            <div>
              <Label className="text-xs">Secondary logo URL</Label>
              <Input
                value={secondaryLogoUrl}
                onChange={(e) => setSecondaryLogoUrl(e.target.value)}
                placeholder="(optional, shown on certificates)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-semibold text-sm">Money &amp; tax</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs">Primary currency (ISO 4217)</Label>
              <Input
                value={primaryCurrency}
                onChange={(e) => setPrimaryCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
            <div>
              <Label className="text-xs">Tax jurisdiction</Label>
              <Input
                value={taxJurisdiction}
                onChange={(e) => setTaxJurisdiction(e.target.value)}
                placeholder="SG / EU-DE / US-CA"
              />
            </div>
            <div>
              <Label className="text-xs">Tax registration number</Label>
              <Input
                value={taxRegistrationNumber}
                onChange={(e) => setTaxRegistrationNumber(e.target.value)}
                placeholder="GST/VAT id printed on invoices"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Default author revenue split</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={splitPct}
                  onChange={(e) => setSplitPct(e.target.value)}
                />
                <span className="text-xs text-muted-foreground">% to developer</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Spec §15 step 3 — share credited to the course developer.
                Remainder goes to the academy. Default 50/50.
              </p>
            </div>
            <div>
              <Label className="text-xs">Banner rotation (ms)</Label>
              <Input
                type="number"
                min="1500"
                max="60000"
                step="500"
                value={bannerRotationMs}
                onChange={(e) => setBannerRotationMs(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="font-semibold text-sm">Gen-AI authoring</h2>
          <div className="flex items-center gap-3">
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            <span className="text-sm">
              {aiEnabled ? "Enabled" : "Disabled"} for course developers in this academy.
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Spec §8.3 — AI output is always logged for audit, never auto-published.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Save settings
        </Button>
      </div>
    </div>
  )
}
