"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react"

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED"

type ProgrammeRow = {
  id: string
  title: string
  slug: string
  subtitle: string | null
  price: number
  currency: string
  isFree: boolean
  status: Status
  accessDurationDays: number
  publishedAt: string | null
  accessGrantCount: number
  courses: { id: string; title: string }[]
}

type CourseRef = {
  id: string
  title: string
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED"
}

interface Props {
  defaultCurrency: string
  initialProgrammes: ProgrammeRow[]
  courses: CourseRef[]
}

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "outline"> = {
  DRAFT: "secondary",
  PUBLISHED: "default",
  ARCHIVED: "outline",
}

export function ProgrammesManager({ defaultCurrency, initialProgrammes, courses }: Props) {
  const router = useRouter()
  const [programmes, setProgrammes] = useState<ProgrammeRow[]>(initialProgrammes)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ProgrammeRow | null>(null)

  function applyUpdate(updated: ProgrammeRow) {
    setProgrammes((p) => p.map((x) => (x.id === updated.id ? updated : x)))
  }

  async function handleStatus(id: string, status: Status) {
    try {
      const res = await fetch(`/api/academy/programmes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Update failed")
      }
      const { programme } = await res.json()
      setProgrammes((p) =>
        p.map((x) =>
          x.id === id
            ? {
                ...x,
                status: programme.status,
                publishedAt: programme.publishedAt,
              }
            : x
        )
      )
      toast.success(`Programme ${status.toLowerCase()}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed")
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this programme? This cannot be undone.")) return
    try {
      const res = await fetch(`/api/academy/programmes/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Delete failed")
      }
      setProgrammes((p) => p.filter((x) => x.id !== id))
      toast.success("Programme deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed")
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4 mr-1" /> Create programme
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Courses</TableHead>
                <TableHead className="text-right">Access</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Learners</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programmes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    No programmes yet. Create one to bundle two or more courses.
                  </TableCell>
                </TableRow>
              ) : (
                programmes.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {p.slug}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {p.isFree ? "Free" : `${p.currency} ${p.price.toFixed(2)}`}
                    </TableCell>
                    <TableCell className="text-right text-sm">{p.courses.length}</TableCell>
                    <TableCell className="text-right text-xs">
                      {p.accessDurationDays}d
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[p.status]}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {p.accessGrantCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {p.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatus(p.id, "PUBLISHED")}
                          >
                            Approve &amp; publish
                          </Button>
                        )}
                        {p.status === "PUBLISHED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatus(p.id, "ARCHIVED")}
                          >
                            Archive
                          </Button>
                        )}
                        {p.status === "ARCHIVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatus(p.id, "DRAFT")}
                          >
                            Restore
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(p)}
                          aria-label="Edit programme"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(p.id)}
                          aria-label="Delete programme"
                          disabled={p.accessGrantCount > 0}
                          title={p.accessGrantCount > 0 ? "Has learner access — archive instead" : ""}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {creating && (
        <ProgrammeFormDialog
          mode="create"
          defaultCurrency={defaultCurrency}
          courses={courses}
          onClose={() => setCreating(false)}
          onSaved={(p) => {
            setProgrammes((prev) => [p, ...prev])
            setCreating(false)
            router.refresh()
          }}
        />
      )}

      {editing && (
        <ProgrammeFormDialog
          mode="edit"
          existing={editing}
          defaultCurrency={defaultCurrency}
          courses={courses}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            applyUpdate(p)
            setEditing(null)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

interface FormDialogProps {
  mode: "create" | "edit"
  existing?: ProgrammeRow
  defaultCurrency: string
  courses: CourseRef[]
  onClose: () => void
  onSaved: (p: ProgrammeRow) => void
}

function ProgrammeFormDialog({
  mode,
  existing,
  defaultCurrency,
  courses,
  onClose,
  onSaved,
}: FormDialogProps) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? "")
  const [description, setDescription] = useState("")
  const [price, setPrice] = useState(String(existing?.price ?? 0))
  const [currency, setCurrency] = useState(existing?.currency ?? defaultCurrency)
  const [isFree, setIsFree] = useState(existing?.isFree ?? false)
  const [accessDurationDays, setAccessDurationDays] = useState(
    String(existing?.accessDurationDays ?? 90)
  )
  const [selected, setSelected] = useState<Set<string>>(
    new Set(existing?.courses.map((c) => c.id) ?? [])
  )
  const [submitting, setSubmitting] = useState(false)

  function toggleCourse(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    if (selected.size < 2) {
      toast.error("Pick at least two courses")
      return
    }
    const priceNum = parseFloat(price || "0")
    if (Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Price must be ≥ 0")
      return
    }
    const accessNum = parseInt(accessDurationDays, 10)
    if (Number.isNaN(accessNum) || accessNum < 1) {
      toast.error("Access window must be ≥ 1 day")
      return
    }

    setSubmitting(true)
    try {
      const body = {
        title: title.trim(),
        subtitle: subtitle.trim() || null,
        ...(mode === "create" ? { description: description.trim() || null } : {}),
        price: priceNum,
        currency: currency.trim().toUpperCase(),
        isFree,
        accessDurationDays: accessNum,
        courseIds: Array.from(selected),
      }
      const url =
        mode === "create"
          ? "/api/academy/programmes"
          : `/api/academy/programmes/${existing!.id}`
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Save failed")
      }
      const { programme } = await res.json()
      const courseLookup = new Map(courses.map((c) => [c.id, c]))
      const courseRefs = Array.from(selected)
        .map((id) => courseLookup.get(id))
        .filter((c): c is CourseRef => Boolean(c))
        .map((c) => ({ id: c.id, title: c.title }))

      onSaved({
        id: programme.id,
        title: programme.title,
        slug: programme.slug,
        subtitle: programme.subtitle,
        price: Number(programme.price),
        currency: programme.currency,
        isFree: programme.isFree,
        status: programme.status,
        accessDurationDays: programme.accessDurationDays,
        publishedAt: programme.publishedAt,
        accessGrantCount: existing?.accessGrantCount ?? 0,
        courses: courseRefs,
      })
      toast.success(mode === "create" ? "Programme created" : "Programme saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create programme" : "Edit programme"}
          </DialogTitle>
          <DialogDescription>
            Programmes bundle two or more courses behind one price and one
            shared access window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Data Foundations Programme"
            />
          </div>

          <div>
            <Label className="text-xs">Subtitle</Label>
            <Input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={240}
              placeholder="Optional short description"
            />
          </div>

          {mode === "create" && (
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                disabled={isFree}
              />
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                disabled={isFree}
              />
            </div>
            <div>
              <Label className="text-xs">Access window (days)</Label>
              <Input
                type="number"
                min="1"
                max="3650"
                value={accessDurationDays}
                onChange={(e) => setAccessDurationDays(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 border rounded-md p-3">
            <Switch checked={isFree} onCheckedChange={setIsFree} />
            <span className="text-sm">
              Free programme (no price, no certificate revenue split)
            </span>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs">Courses included</Label>
              <span className="text-[11px] text-muted-foreground">
                {selected.size} selected · need ≥ 2
              </span>
            </div>
            <div className="border rounded-md max-h-72 overflow-y-auto">
              {courses.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  No courses available in this academy yet.
                </div>
              ) : (
                courses.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-2 border-b last:border-b-0 hover:bg-accent/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selected.has(c.id)}
                      onCheckedChange={() => toggleCourse(c.id)}
                    />
                    <span className="flex-1 text-sm">{c.title}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.status}
                    </Badge>
                  </label>
                ))
              )}
            </div>
          </div>

          {mode === "edit" && existing?.status && (
            <div className="border rounded-md p-3">
              <Label className="text-xs">Status</Label>
              <Select
                value={existing.status}
                onValueChange={async (v) => {
                  await fetch(`/api/academy/programmes/${existing.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: v }),
                  })
                  toast.success(`Status set to ${v}`)
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PUBLISHED">Published</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {mode === "create" ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
