"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, Eye, Send } from "lucide-react"

type PayoutGroup = "ACADEMY" | "DEVELOPER" | "MARKETER" | "PLATFORM_SUPPORT"

type PreviewResult = {
  summary: { legCount: number; totalMinor: number; currency: string }
  byBeneficiary: Array<{
    beneficiaryUserId: string | null
    amountMinor: number
    legCount: number
  }>
}

interface Props {
  academyId: string
}

function defaultPeriod() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
  }
}

function formatMinor(minor: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100)
}

export function PayoutBatchManager({ academyId }: Props) {
  const router = useRouter()
  const initial = defaultPeriod()
  const [payoutGroup, setPayoutGroup] = useState<PayoutGroup>("ACADEMY")
  const [periodStart, setPeriodStart] = useState(initial.periodStart)
  const [periodEnd, setPeriodEnd] = useState(initial.periodEnd)
  const [currency, setCurrency] = useState("USD")
  const [notes, setNotes] = useState("")
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [generating, setGenerating] = useState(false)

  function buildPayload(extra?: { preview: boolean }) {
    return {
      academyId,
      payoutGroup,
      periodStart: new Date(periodStart + "T00:00:00.000Z").toISOString(),
      periodEnd: new Date(periodEnd + "T23:59:59.999Z").toISOString(),
      currency: currency.toUpperCase(),
      notes: notes || undefined,
      ...extra,
    }
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const res = await fetch("/api/academy/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload({ preview: true })),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Preview failed")
      setPreview(data.preview as PreviewResult)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed")
      setPreview(null)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleGenerate() {
    if (!preview || preview.summary.legCount === 0) {
      toast.error("Preview first — nothing to batch.")
      return
    }
    setGenerating(true)
    try {
      const res = await fetch("/api/academy/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Generate failed")
      toast.success(
        `Batch created · ${data.attached} legs · ${formatMinor(
          data.totalMinor,
          currency.toUpperCase()
        )}`
      )
      setPreview(null)
      setNotes("")
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate failed")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Generate a payout batch</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Group</Label>
            <Select
              value={payoutGroup}
              onValueChange={(v) => {
                setPayoutGroup(v as PayoutGroup)
                setPreview(null)
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACADEMY">Academy</SelectItem>
                <SelectItem value="DEVELOPER">Developer</SelectItem>
                <SelectItem value="MARKETER">Marketer</SelectItem>
                <SelectItem value="PLATFORM_SUPPORT">Platform Support</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period start</Label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => {
                setPeriodStart(e.target.value)
                setPreview(null)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Period end</Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => {
                setPeriodEnd(e.target.value)
                setPreview(null)
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Input
              maxLength={3}
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value.toUpperCase())
                setPreview(null)
              }}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. March 2026 monthly payout"
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={previewing || generating}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Eye className="h-4 w-4 mr-1" />
            )}
            Preview
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={
              !preview ||
              preview.summary.legCount === 0 ||
              preview.summary.totalMinor <= 0 ||
              generating ||
              previewing
            }
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Send className="h-4 w-4 mr-1" />
            )}
            Generate batch
          </Button>
        </div>

        {preview && (
          <div className="border rounded-md p-4 space-y-3 text-sm bg-muted/30">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Eligible legs</span>
              <span className="font-mono">{preview.summary.legCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total owed</span>
              <span className="font-mono font-semibold">
                {formatMinor(preview.summary.totalMinor, preview.summary.currency)}
              </span>
            </div>
            {preview.byBeneficiary.length > 0 && (
              <div className="border-t pt-2 space-y-1">
                <div className="text-xs text-muted-foreground mb-1">
                  By beneficiary
                </div>
                {preview.byBeneficiary.map((b) => (
                  <div
                    key={b.beneficiaryUserId ?? "_unassigned"}
                    className="flex justify-between text-xs"
                  >
                    <span className="font-mono">
                      {b.beneficiaryUserId
                        ? b.beneficiaryUserId.slice(-12)
                        : "— (group)"}
                    </span>
                    <span className="font-mono">
                      {formatMinor(b.amountMinor, preview.summary.currency)} ·{" "}
                      {b.legCount} leg{b.legCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {preview.summary.legCount === 0 && (
              <div className="text-xs text-muted-foreground">
                No eligible legs in that window.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
