"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Plus, Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type CpdEntry = {
  id: string
  name: string
  points: string | number
  badgeUrl: string | null
  sortOrder: number
}

interface Props {
  initialEntries: CpdEntry[]
}

export function CpdCatalogManager({ initialEntries }: Props) {
  const router = useRouter()
  const [entries, setEntries] = useState<CpdEntry[]>(initialEntries)
  const [name, setName] = useState("")
  const [points, setPoints] = useState("1")
  const [badgeUrl, setBadgeUrl] = useState("")
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    const pts = parseFloat(points || "0")
    if (Number.isNaN(pts) || pts < 0) {
      toast.error("Points must be ≥ 0")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/academy/cpd-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          points: pts,
          badgeUrl: badgeUrl.trim() || null,
          sortOrder: entries.length,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Create failed")
      }
      const { entry } = (await res.json()) as { entry: CpdEntry }
      setEntries((p) => [...p, entry])
      setName("")
      setPoints("1")
      setBadgeUrl("")
      toast.success(`${entry.name} added`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed")
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this CPD entry? Courses using it must be reassigned first.")) {
      return
    }
    try {
      const res = await fetch(`/api/academy/cpd-catalog/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Delete failed")
      }
      setEntries((p) => p.filter((e) => e.id !== id))
      toast.success("Removed")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5 space-y-3">
          <div>
            <h2 className="font-semibold text-sm">Add CPD entry</h2>
            <p className="text-[11px] text-muted-foreground mt-1">
              Spec §4.2 — CPD badges shown on course cards and printed on
              certificates. Courses select one entry from this list.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ACCA / ICA / IBF FTS"
                disabled={creating}
                maxLength={120}
              />
            </div>
            <div>
              <Label className="text-xs">Points</Label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                disabled={creating}
              />
            </div>
            <div>
              <Label className="text-xs">Badge URL</Label>
              <Input
                value={badgeUrl}
                onChange={(e) => setBadgeUrl(e.target.value)}
                placeholder="(optional)"
                disabled={creating}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead>Badge</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-8">
                    No CPD entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm">{e.name}</TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(e.points).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.badgeUrl ? (
                        <a
                          href={e.badgeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          link
                        </a>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(e.id)}
                        aria-label="Delete CPD entry"
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
