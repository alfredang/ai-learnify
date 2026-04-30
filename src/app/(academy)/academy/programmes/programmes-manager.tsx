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
import { Textarea } from "@/components/ui/textarea"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, X, Plus as PlusIcon } from "lucide-react"
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
  const [selectedIds, setSelectedIds] = useState<string[]>(
    existing?.courses.map((c) => c.id) ?? []
  )
  const [submitting, setSubmitting] = useState(false)

  function addCourse(id: string) {
    if (selectedIds.includes(id)) return
    setSelectedIds([...selectedIds, id])
  }

  function removeCourse(id: string) {
    setSelectedIds(selectedIds.filter((cid) => cid !== id))
  }

  function reorderSelected(activeId: string, overId: string) {
    const oldIndex = selectedIds.indexOf(activeId)
    const newIndex = selectedIds.indexOf(overId)
    if (oldIndex === -1 || newIndex === -1) return
    setSelectedIds(arrayMove(selectedIds, oldIndex, newIndex))
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("Title is required")
      return
    }
    if (selectedIds.length < 2) {
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
        courseIds: selectedIds,
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
        // Surface the specific Zod issue (e.g. "accessDurationDays must
        // be at most 36500") so the user can fix the offending field
        // instead of guessing what's wrong.
        if (Array.isArray(err.issues) && err.issues.length > 0) {
          const first = err.issues[0]
          const path = Array.isArray(first.path) ? first.path.join(".") : ""
          const pretty = path
            .replace(/^title$/, "Title")
            .replace(/^subtitle$/, "Subtitle")
            .replace(/^accessDurationDays$/, "Access window (days)")
            .replace(/^price$/, "Price")
            .replace(/^currency$/, "Currency")
            .replace(/^thumbnail$/, "Thumbnail URL")
            .replace(/^courseIds$/, "Courses included")
          throw new Error(`${pretty || "Invalid input"}: ${first.message}`)
        }
        throw new Error(err.error ?? "Save failed")
      }
      const { programme } = await res.json()
      const courseLookup = new Map(courses.map((c) => [c.id, c]))
      const courseRefs = selectedIds
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

          <ProgrammeCoursesEditor
            courses={courses}
            selectedIds={selectedIds}
            onAdd={addCourse}
            onRemove={removeCourse}
            onReorder={reorderSelected}
          />

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

// ─── ProgrammeCoursesEditor (drag-and-drop two-column UI) ──────────────

interface ProgrammeCoursesEditorProps {
  courses: CourseRef[]
  selectedIds: string[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
  onReorder: (activeId: string, overId: string) => void
}

function ProgrammeCoursesEditor({
  courses,
  selectedIds,
  onAdd,
  onRemove,
  onReorder,
}: ProgrammeCoursesEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const courseLookup = new Map(courses.map((c) => [c.id, c]))
  const selectedCourses = selectedIds
    .map((id) => courseLookup.get(id))
    .filter((c): c is CourseRef => Boolean(c))

  const available = courses.filter((c) => !selectedIds.includes(c.id))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onReorder(String(active.id), String(over.id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Courses included</Label>
        <span className="text-[11px] text-muted-foreground">
          {selectedIds.length} selected · need ≥ 2 · drag to reorder
        </span>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-md border p-4 text-sm text-muted-foreground text-center">
          No courses available in this academy yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Available column */}
          <div className="rounded-md border bg-muted/20">
            <div className="px-3 py-2 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Available ({available.length})
            </div>
            <div className="max-h-72 overflow-y-auto divide-y">
              {available.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  All courses added.
                </div>
              ) : (
                available.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-accent/40"
                  >
                    <span className="flex-1 text-sm truncate">{c.title}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {c.status}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onAdd(c.id)}
                      aria-label="Add to programme"
                      className="h-7 w-7 shrink-0"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Selected column (sortable) */}
          <div className="rounded-md border">
            <div className="px-3 py-2 border-b text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Programme order
            </div>
            <div className="max-h-72 overflow-y-auto">
              {selectedCourses.length === 0 ? (
                <div className="px-3 py-6 text-xs text-muted-foreground text-center">
                  Drag or click to add courses.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selectedIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y">
                      {selectedCourses.map((c, idx) => (
                        <SortableSelectedItem
                          key={c.id}
                          course={c}
                          position={idx + 1}
                          onRemove={() => onRemove(c.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableSelectedItem({
  course,
  position,
  onRemove,
}: {
  course: CourseRef
  position: number
  onRemove: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: course.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "flex items-center gap-2 px-3 py-2 bg-background" +
        (isDragging ? " opacity-50 ring-1 ring-primary/20" : " hover:bg-accent/40")
      }
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 text-muted-foreground"
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">
        {position}.
      </span>
      <span className="flex-1 text-sm truncate">{course.title}</span>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {course.status}
      </Badge>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label="Remove from programme"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
