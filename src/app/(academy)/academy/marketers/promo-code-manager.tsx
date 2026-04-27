"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Loader2, Plus } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type Marketer = { id: string; name: string | null; email: string }
type PromoCode = {
  id: string
  code: string
  marketerUserId: string | null
  marketerCommissionBps: number
  learnerDiscountBps: number
  validFrom: string | null
  validTo: string | null
  usageLimit: number | null
  usageCount: number
  isActive: boolean
  marketer?: Marketer | null
}

interface PromoCodeManagerProps {
  initialCodes: PromoCode[]
  marketers: Marketer[]
}

export function PromoCodeManager({ initialCodes, marketers }: PromoCodeManagerProps) {
  const [codes, setCodes] = useState<PromoCode[]>(initialCodes)
  const [code, setCode] = useState("")
  const [commissionPct, setCommissionPct] = useState("10")
  const [discountPct, setDiscountPct] = useState("10")
  const [marketerUserId, setMarketerUserId] = useState<string>("")
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!code) {
      toast.error("Code is required")
      return
    }
    const commBps = Math.round(parseFloat(commissionPct || "0") * 100)
    const discBps = Math.round(parseFloat(discountPct || "0") * 100)

    setCreating(true)
    try {
      const res = await fetch("/api/academy/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          marketerUserId: marketerUserId || null,
          marketerCommissionBps: commBps,
          learnerDiscountBps: discBps,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Create failed")
      }
      const { promo } = (await res.json()) as { promo: PromoCode }
      setCodes((p) => [promo, ...p])
      setCode("")
      toast.success(`Code ${promo.code} created`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    setCodes((p) => p.map((c) => (c.id === id ? { ...c, isActive } : c)))
    try {
      const res = await fetch(`/api/academy/promo-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Could not save")
      setCodes((p) => p.map((c) => (c.id === id ? { ...c, isActive: !isActive } : c)))
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <h2 className="font-semibold text-sm">Create promo code</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label htmlFor="code" className="text-xs">Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="LAUNCH50"
                disabled={creating}
                maxLength={64}
              />
            </div>
            <div>
              <Label htmlFor="discount" className="text-xs">Learner discount %</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label htmlFor="commission" className="text-xs">Marketer commission %</Label>
              <Input
                id="commission"
                type="number"
                min="0"
                max="50"
                step="0.1"
                value={commissionPct}
                onChange={(e) => setCommissionPct(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label className="text-xs">Marketer (optional)</Label>
              <Select value={marketerUserId} onValueChange={(v) => setMarketerUserId(v === "_none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">(none)</SelectItem>
                  {marketers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name ?? m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Create code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Marketer</TableHead>
                <TableHead className="text-right">Usage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No promo codes yet.
                  </TableCell>
                </TableRow>
              ) : (
                codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono">{c.code}</TableCell>
                    <TableCell>{(c.learnerDiscountBps / 100).toFixed(1)}%</TableCell>
                    <TableCell>{(c.marketerCommissionBps / 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-sm">
                      {c.marketer ? c.marketer.name ?? c.marketer.email : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {c.usageCount}{c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={(v) => handleToggle(c.id, v)}
                        />
                        <Badge variant={c.isActive ? "default" : "outline"}>
                          {c.isActive ? "Active" : "Disabled"}
                        </Badge>
                      </div>
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
