"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, Plus, Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type TaxRate = {
  id: string
  jurisdiction: string
  label: string | null
  rateBps: number
  appliesFrom: string
  isActive: boolean
}

interface Props {
  initialRates: TaxRate[]
}

export function TaxRatesManager({ initialRates }: Props) {
  const router = useRouter()
  const [rates, setRates] = useState<TaxRate[]>(initialRates)
  const [jurisdiction, setJurisdiction] = useState("")
  const [label, setLabel] = useState("GST")
  const [ratePct, setRatePct] = useState("8")
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!jurisdiction.trim()) {
      toast.error("Jurisdiction is required")
      return
    }
    const bps = Math.round(parseFloat(ratePct || "0") * 100)
    if (Number.isNaN(bps) || bps < 0 || bps > 10_000) {
      toast.error("Rate must be 0–100%")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/academy/tax-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jurisdiction: jurisdiction.trim().toUpperCase(),
          label: label.trim() || "Tax",
          rateBps: bps,
          isActive: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Create failed")
      }
      const { rate } = (await res.json()) as { rate: TaxRate }
      setRates((p) => [rate, ...p])
      setJurisdiction("")
      setRatePct("8")
      toast.success(`${rate.jurisdiction} added`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  async function toggleActive(id: string, isActive: boolean) {
    setRates((p) => p.map((r) => (r.id === id ? { ...r, isActive } : r)))
    try {
      const res = await fetch(`/api/academy/tax-rates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Could not save")
      setRates((p) => p.map((r) => (r.id === id ? { ...r, isActive: !isActive } : r)))
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this tax rate? Past invoices keep their stored tax — only future charges are affected.")) {
      return
    }
    try {
      const res = await fetch(`/api/academy/tax-rates/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setRates((p) => p.filter((r) => r.id !== id))
      toast.success("Tax rate removed")
    } catch {
      toast.error("Delete failed")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold text-sm">Add tax rate</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Jurisdiction</Label>
              <Input
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value.toUpperCase())}
                placeholder="SG / EU-DE / US-CA"
                disabled={creating}
              />
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="GST / VAT / Sales Tax"
                disabled={creating}
                maxLength={40}
              />
            </div>
            <div>
              <Label className="text-xs">Rate (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={ratePct}
                onChange={(e) => setRatePct(e.target.value)}
                disabled={creating}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Jurisdiction</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Effective from</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No tax rates configured.
                  </TableCell>
                </TableRow>
              ) : (
                rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.jurisdiction}</TableCell>
                    <TableCell className="text-sm">{r.label ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">
                      {(r.rateBps / 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.appliesFrom).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={r.isActive}
                          onCheckedChange={(v) => toggleActive(r.id, v)}
                        />
                        <Badge variant={r.isActive ? "default" : "outline"}>
                          {r.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(r.id)}
                        aria-label="Delete tax rate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
