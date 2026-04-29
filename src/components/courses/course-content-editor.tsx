"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Film,
  FileText,
  HelpCircle,
  Video,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { VideoUpload } from "@/components/courses/video-upload"
import { QuizBuilder } from "@/components/courses/quiz-builder"
import {
  LecturePayloadEditor,
  type LecturePayload,
  type PayloadLectureType,
} from "@/components/courses/editor-sections/lecture-payload-editor"
import { quizDataSchema } from "@/lib/validations/course"
import { cn, formatDuration } from "@/lib/utils"

interface Section {
  id: string
  title: string
  description: string | null
  position: number
  lectures: Lecture[]
}

interface Lecture {
  id: string
  title: string
  description: string | null
  type: "VIDEO" | "TEXT" | "QUIZ" | "PDF" | "SCORM" | "XAPI" | "VOICE_OVER_SLIDES" | "DOWNLOADABLE" | "HTML"
  position: number
  videoUrl: string | null
  videoDuration: number | null
  videoPublicId: string | null
  content: string | null
  isFreePreview: boolean
}

interface CourseContentEditorProps {
  courseId: string
  sections: Section[]
  academyId?: string | null
}

const lectureTypeIcons = {
  VIDEO: Film,
  TEXT: FileText,
  QUIZ: HelpCircle,
  PDF: FileText,
  SCORM: FileText,
  XAPI: FileText,
  VOICE_OVER_SLIDES: FileText,
  DOWNLOADABLE: FileText,
  HTML: FileText,
}

const PAYLOAD_TYPES: PayloadLectureType[] = [
  "PDF",
  "SCORM",
  "XAPI",
  "VOICE_OVER_SLIDES",
  "DOWNLOADABLE",
  "HTML",
]

function isPayloadType(t: string): t is PayloadLectureType {
  return (PAYLOAD_TYPES as string[]).includes(t)
}

type ValidationResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string }

function validatePayload(
  type: PayloadLectureType,
  payload: LecturePayload
): ValidationResult {
  if (!payload) {
    return { ok: false, error: "Please fill in the lecture content first." }
  }
  switch (type) {
    case "PDF": {
      const url = payload.pdfUrl
      if (typeof url !== "string" || !url.trim()) {
        return { ok: false, error: "PDF URL is required." }
      }
      return { ok: true, payload: { pdfUrl: url.trim() } }
    }
    case "SCORM": {
      const pkg = payload.packageUrl
      if (typeof pkg !== "string" || !pkg.trim()) {
        return { ok: false, error: "SCORM package URL is required." }
      }
      const out: Record<string, unknown> = { packageUrl: pkg.trim() }
      if (typeof payload.entryPoint === "string" && payload.entryPoint.trim()) {
        out.entryPoint = payload.entryPoint.trim()
      }
      const v = payload.version
      out.version = v === "SCORM_2004" ? "SCORM_2004" : "SCORM_1_2"
      return { ok: true, payload: out }
    }
    case "XAPI": {
      const launch = payload.launchUrl
      if (typeof launch !== "string" || !launch.trim()) {
        return { ok: false, error: "xAPI launch URL is required." }
      }
      const out: Record<string, unknown> = { launchUrl: launch.trim() }
      if (typeof payload.activityId === "string" && payload.activityId.trim()) {
        out.activityId = payload.activityId.trim()
      }
      return { ok: true, payload: out }
    }
    case "VOICE_OVER_SLIDES": {
      const url = payload.pdfUrl
      if (typeof url !== "string" || !url.trim()) {
        return { ok: false, error: "Slides PDF URL is required." }
      }
      const slides = Array.isArray(payload.slides) ? payload.slides : []
      return {
        ok: true,
        payload: {
          pdfUrl: url.trim(),
          slides: slides.filter(
            (s): s is { page: number; voText: string } =>
              !!s &&
              typeof s === "object" &&
              "page" in (s as Record<string, unknown>) &&
              typeof (s as { page: unknown }).page === "number"
          ),
        },
      }
    }
    case "DOWNLOADABLE": {
      const files = Array.isArray(payload.files) ? payload.files : []
      const cleaned = files
        .filter(
          (f): f is { name: string; url: string; sizeBytes?: number } =>
            !!f &&
            typeof f === "object" &&
            "name" in (f as Record<string, unknown>) &&
            "url" in (f as Record<string, unknown>) &&
            typeof (f as { name: unknown }).name === "string" &&
            typeof (f as { url: unknown }).url === "string"
        )
        .filter((f) => f.name.trim() && f.url.trim())
      if (cleaned.length === 0) {
        return { ok: false, error: "Add at least one downloadable file with a name and URL." }
      }
      return { ok: true, payload: { files: cleaned } }
    }
    case "HTML": {
      const html = payload.html
      if (typeof html !== "string" || !html.trim()) {
        return { ok: false, error: "HTML content is required." }
      }
      return { ok: true, payload: { html } }
    }
  }
}

function SortableSectionItem({
  id,
  children,
}: {
  id: string
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"]
    listeners: ReturnType<typeof useSortable>["listeners"]
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "border rounded-lg overflow-hidden",
        isDragging && "opacity-50 ring-2 ring-primary/20 z-10"
      )}
    >
      {children({ attributes, listeners })}
    </div>
  )
}

function SortableLectureItem({
  id,
  children,
}: {
  id: string
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"]
    listeners: ReturnType<typeof useSortable>["listeners"]
  }) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 pl-12 hover:bg-muted/20 transition-colors group",
        isDragging && "opacity-50 bg-muted/30 ring-1 ring-primary/20"
      )}
    >
      {children({ attributes, listeners })}
    </div>
  )
}

export function CourseContentEditor({
  courseId,
  sections: initialSections,
  academyId,
}: CourseContentEditorProps) {
  const queryClient = useQueryClient()

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(initialSections.map((s) => s.id))
  )

  // Section dialogs
  const [showAddSection, setShowAddSection] = useState(false)
  const [editingSection, setEditingSection] = useState<Section | null>(null)
  const [deletingSection, setDeletingSection] = useState<Section | null>(null)
  const [sectionTitle, setSectionTitle] = useState("")
  const [sectionDesc, setSectionDesc] = useState("")
  const [sectionLoading, setSectionLoading] = useState(false)

  // Lecture dialogs
  const [addLectureToSection, setAddLectureToSection] = useState<string | null>(null)
  const [editingLecture, setEditingLecture] = useState<{
    lecture: Lecture
    sectionId: string
  } | null>(null)
  const [deletingLecture, setDeletingLecture] = useState<{
    lecture: Lecture
    sectionId: string
  } | null>(null)
  const [lectureTitle, setLectureTitle] = useState("")
  const [lectureDesc, setLectureDesc] = useState("")
  const [lectureType, setLectureType] = useState<
    | "VIDEO"
    | "TEXT"
    | "QUIZ"
    | "PDF"
    | "SCORM"
    | "XAPI"
    | "VOICE_OVER_SLIDES"
    | "DOWNLOADABLE"
    | "HTML"
  >("VIDEO")
  const [lectureIsFree, setLectureIsFree] = useState(false)
  const [lectureContent, setLectureContent] = useState("")
  const [lecturePayload, setLecturePayload] = useState<LecturePayload>(null)
  const [lectureLoading, setLectureLoading] = useState(false)
  const [isVideoUploading, setIsVideoUploading] = useState(false)

  // Video data for lecture create/edit
  const [videoData, setVideoData] = useState<{
    videoUrl: string
    videoPublicId: string
    videoDuration: number
  } | null>(null)

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function refreshCourse() {
    await queryClient.invalidateQueries({ queryKey: ["course", courseId] })
  }

  // ─── Drag-and-Drop ────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  async function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = initialSections.findIndex((s) => s.id === active.id)
    const newIndex = initialSections.findIndex((s) => s.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(initialSections, oldIndex, newIndex)
    const orderedIds = reordered.map((s) => s.id)

    // Optimistic update
    queryClient.setQueryData(
      ["course", courseId],
      (old: { course: { sections: Section[] } } | undefined) => {
        if (!old) return old
        return {
          ...old,
          course: {
            ...old.course,
            sections: reordered.map((s, i) => ({ ...s, position: i })),
          },
        }
      }
    )

    try {
      const res = await fetch(`/api/courses/${courseId}/sections/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      })
      if (!res.ok) throw new Error("Failed to reorder sections")
    } catch {
      toast.error("Failed to reorder sections")
      await refreshCourse()
    }
  }

  async function handleLectureDragEnd(sectionId: string, event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const section = initialSections.find((s) => s.id === sectionId)
    if (!section) return

    const oldIndex = section.lectures.findIndex((l) => l.id === active.id)
    const newIndex = section.lectures.findIndex((l) => l.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(section.lectures, oldIndex, newIndex)
    const orderedIds = reordered.map((l) => l.id)

    // Optimistic update
    queryClient.setQueryData(
      ["course", courseId],
      (old: { course: { sections: Section[] } } | undefined) => {
        if (!old) return old
        return {
          ...old,
          course: {
            ...old.course,
            sections: old.course.sections.map((s) =>
              s.id === sectionId
                ? {
                    ...s,
                    lectures: reordered.map((l, i) => ({
                      ...l,
                      position: i,
                    })),
                  }
                : s
            ),
          },
        }
      }
    )

    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${sectionId}/lectures/reorder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds }),
        }
      )
      if (!res.ok) throw new Error("Failed to reorder lectures")
    } catch {
      toast.error("Failed to reorder lectures")
      await refreshCourse()
    }
  }

  // ─── Section CRUD ────────────────────────────────────────

  function openAddSection() {
    setSectionTitle("")
    setSectionDesc("")
    setShowAddSection(true)
  }

  function openEditSection(section: Section) {
    setSectionTitle(section.title)
    setSectionDesc(section.description || "")
    setEditingSection(section)
  }

  async function handleAddSection() {
    if (!sectionTitle.trim()) return
    setSectionLoading(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: sectionTitle.trim(),
          description: sectionDesc.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to create section")
      }
      toast.success("Section added")
      setShowAddSection(false)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create section")
    } finally {
      setSectionLoading(false)
    }
  }

  async function handleEditSection() {
    if (!editingSection || !sectionTitle.trim()) return
    setSectionLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${editingSection.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: sectionTitle.trim(),
            description: sectionDesc.trim() || null,
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to update section")
      }
      toast.success("Section updated")
      setEditingSection(null)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update section")
    } finally {
      setSectionLoading(false)
    }
  }

  async function handleDeleteSection() {
    if (!deletingSection) return
    setSectionLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${deletingSection.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete section")
      }
      toast.success("Section deleted")
      setDeletingSection(null)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete section")
    } finally {
      setSectionLoading(false)
    }
  }

  // ─── Lecture CRUD ────────────────────────────────────────

  function openAddLecture(sectionId: string) {
    setLectureTitle("")
    setLectureDesc("")
    setLectureType("VIDEO")
    setLectureIsFree(false)
    setLectureContent("")
    setLecturePayload(null)
    setVideoData(null)
    setIsVideoUploading(false)
    setAddLectureToSection(sectionId)
  }

  function openEditLecture(lecture: Lecture, sectionId: string) {
    setLectureTitle(lecture.title)
    setLectureDesc(lecture.description || "")
    setLectureType(lecture.type)
    setLectureIsFree(lecture.isFreePreview)
    setLectureContent(lecture.content || "")
    const existingPayload = (lecture as unknown as { contentPayloadJson?: unknown })
      .contentPayloadJson
    setLecturePayload(
      existingPayload && typeof existingPayload === "object" && existingPayload !== null
        ? (existingPayload as LecturePayload)
        : null
    )
    setIsVideoUploading(false)
    setVideoData(
      lecture.videoUrl
        ? {
            videoUrl: lecture.videoUrl,
            videoPublicId: lecture.videoPublicId || "",
            videoDuration: lecture.videoDuration || 0,
          }
        : null
    )
    setEditingLecture({ lecture, sectionId })
  }

  async function handleAddLecture() {
    if (!addLectureToSection || !lectureTitle.trim()) return
    if (lectureType === "QUIZ" && lectureContent) {
      try {
        const parsed = JSON.parse(lectureContent)
        const result = quizDataSchema.safeParse(parsed)
        if (!result.success) {
          toast.error(result.error.issues[0]?.message || "Invalid quiz data")
          return
        }
      } catch {
        toast.error("Invalid quiz data format")
        return
      }
    }
    let payloadToSave: Record<string, unknown> | undefined
    if (isPayloadType(lectureType)) {
      const validation = validatePayload(lectureType, lecturePayload)
      if (!validation.ok) {
        toast.error(validation.error)
        return
      }
      payloadToSave = validation.payload
    }
    setLectureLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${addLectureToSection}/lectures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: lectureTitle.trim(),
            description: lectureDesc.trim() || undefined,
            type: lectureType,
            isFreePreview: lectureIsFree,
            ...(lectureType === "VIDEO"
              ? {
                  videoUrl: videoData?.videoUrl || "",
                  videoDuration: videoData?.videoDuration || 0,
                  videoPublicId: videoData?.videoPublicId || undefined,
                }
              : {
                  content: lectureContent.trim() || undefined,
                  ...(payloadToSave
                    ? { contentPayloadJson: payloadToSave }
                    : {}),
                }),
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        const msg = err.issues
          ? err.issues.map((i: { message: string }) => i.message).join(", ")
          : err.error || "Failed to create lecture"
        throw new Error(msg)
      }
      toast.success("Lecture added")
      setAddLectureToSection(null)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create lecture")
    } finally {
      setLectureLoading(false)
    }
  }

  async function handleEditLecture() {
    if (!editingLecture || !lectureTitle.trim()) return
    if (lectureType === "QUIZ" && lectureContent) {
      try {
        const parsed = JSON.parse(lectureContent)
        const result = quizDataSchema.safeParse(parsed)
        if (!result.success) {
          toast.error(result.error.issues[0]?.message || "Invalid quiz data")
          return
        }
      } catch {
        toast.error("Invalid quiz data format")
        return
      }
    }
    let payloadToSave: Record<string, unknown> | null = null
    if (isPayloadType(lectureType)) {
      const validation = validatePayload(lectureType, lecturePayload)
      if (!validation.ok) {
        toast.error(validation.error)
        return
      }
      payloadToSave = validation.payload
    }
    setLectureLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${editingLecture.sectionId}/lectures/${editingLecture.lecture.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: lectureTitle.trim(),
            description: lectureDesc.trim() || null,
            type: lectureType,
            isFreePreview: lectureIsFree,
            contentPayloadJson: payloadToSave,
            ...(lectureType === "VIDEO"
              ? {
                  videoUrl: videoData?.videoUrl || "",
                  videoDuration: videoData?.videoDuration || 0,
                  videoPublicId: videoData?.videoPublicId || undefined,
                }
              : {
                  content: lectureContent.trim() || null,
                }),
          }),
        }
      )
      if (!res.ok) {
        const err = await res.json()
        const msg = err.issues
          ? err.issues.map((i: { message: string }) => i.message).join(", ")
          : err.error || "Failed to update lecture"
        throw new Error(msg)
      }
      toast.success("Lecture updated")
      setEditingLecture(null)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update lecture")
    } finally {
      setLectureLoading(false)
    }
  }

  async function handleDeleteLecture() {
    if (!deletingLecture) return
    setLectureLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/sections/${deletingLecture.sectionId}/lectures/${deletingLecture.lecture.id}`,
        { method: "DELETE" }
      )
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to delete lecture")
      }
      toast.success("Lecture deleted")
      setDeletingLecture(null)
      await refreshCourse()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete lecture")
    } finally {
      setLectureLoading(false)
    }
  }

  // ─── Cloudinary thumbnail helper (client-side) ──────────
  function getThumbnailUrl(publicId: string | null): string | null {
    if (!publicId) return null
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    // No Cloudinary configured → no derived thumbnail. Local uploads
    // don't have a separate thumbnail asset; the VideoUpload component
    // renders the video directly when this returns null.
    if (!cloudName) return null
    return `https://res.cloudinary.com/${cloudName}/video/upload/w_640,h_360,c_fill,so_0/${publicId}.jpg`
  }

  // ─── Render ──────────────────────────────────────────────

  const totalLectures = initialSections.reduce(
    (acc, s) => acc + s.lectures.length,
    0
  )

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Course Content</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {initialSections.length} section{initialSections.length !== 1 ? "s" : ""} &middot;{" "}
              {totalLectures} lecture{totalLectures !== 1 ? "s" : ""}
            </p>
          </div>
          <Button onClick={openAddSection} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {initialSections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No sections yet. Add your first section to get started.</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionDragEnd}
            >
              <SortableContext
                items={initialSections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {initialSections.map((section) => {
                  const isExpanded = expandedSections.has(section.id)
                  return (
                    <SortableSectionItem key={section.id} id={section.id}>
                      {({ attributes, listeners }) => (
                        <>
                          {/* Section header */}
                          <div
                            className="flex items-center gap-2 px-4 py-3 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                            onClick={() => toggleSection(section.id)}
                          >
                            <button
                              type="button"
                              className="cursor-grab active:cursor-grabbing touch-none shrink-0"
                              onClick={(e) => e.stopPropagation()}
                              {...attributes}
                              {...listeners}
                            >
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </button>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="font-medium text-sm">
                                Section {section.position + 1}: {section.title}
                              </span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {section.lectures.length} lecture
                                {section.lectures.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <div
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditSection(section)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeletingSection(section)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Lectures list */}
                          {isExpanded && (
                            <div className="divide-y">
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(e) =>
                                  handleLectureDragEnd(section.id, e)
                                }
                              >
                                <SortableContext
                                  items={section.lectures.map((l) => l.id)}
                                  strategy={verticalListSortingStrategy}
                                >
                                  {section.lectures.map((lecture) => {
                                    const Icon = lectureTypeIcons[lecture.type]
                                    return (
                                      <SortableLectureItem
                                        key={lecture.id}
                                        id={lecture.id}
                                      >
                                        {({ attributes: lectureAttrs, listeners: lectureListeners }) => (
                                          <>
                                            <button
                                              type="button"
                                              className="cursor-grab active:cursor-grabbing touch-none shrink-0"
                                              {...lectureAttrs}
                                              {...lectureListeners}
                                            >
                                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </button>
                                            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div className="flex-1 min-w-0">
                                              <span className="text-sm">
                                                {lecture.title}
                                              </span>
                                              {lecture.isFreePreview && (
                                                <Badge
                                                  variant="secondary"
                                                  className="ml-2 text-xs bg-green-100 text-green-800"
                                                >
                                                  Free Preview
                                                </Badge>
                                              )}
                                            </div>
                                            {lecture.type === "VIDEO" &&
                                              lecture.videoDuration && (
                                                <span className="text-xs text-muted-foreground">
                                                  {formatDuration(
                                                    lecture.videoDuration
                                                  )}
                                                </span>
                                              )}
                                            {lecture.type === "VIDEO" && (
                                              <div className="shrink-0">
                                                {lecture.videoUrl ? (
                                                  <Video className="h-3.5 w-3.5 text-green-600" />
                                                ) : (
                                                  <Video className="h-3.5 w-3.5 text-muted-foreground/40" />
                                                )}
                                              </div>
                                            )}
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() =>
                                                  openEditLecture(
                                                    lecture,
                                                    section.id
                                                  )
                                                }
                                              >
                                                <Pencil className="h-3.5 w-3.5" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7 text-destructive hover:text-destructive"
                                                onClick={() =>
                                                  setDeletingLecture({
                                                    lecture,
                                                    sectionId: section.id,
                                                  })
                                                }
                                              >
                                                <Trash2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </>
                                        )}
                                      </SortableLectureItem>
                                    )
                                  })}
                                </SortableContext>
                              </DndContext>

                              {/* Add lecture button */}
                              <div className="px-4 py-2 pl-12">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground"
                                  onClick={() => openAddLecture(section.id)}
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                                  Add Lecture
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </SortableSectionItem>
                  )
                })}
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>

      {/* ─── Add Section Dialog ────────────────────────────── */}
      <Dialog open={showAddSection} onOpenChange={setShowAddSection}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Getting Started"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddSection()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Brief description of this section"
                value={sectionDesc}
                onChange={(e) => setSectionDesc(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={sectionLoading}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              onClick={handleAddSection}
              disabled={sectionLoading || !sectionTitle.trim()}
            >
              {sectionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Section Dialog ───────────────────────────── */}
      <Dialog
        open={!!editingSection}
        onOpenChange={(open) => !open && setEditingSection(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEditSection()
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={sectionDesc}
                onChange={(e) => setSectionDesc(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingSection(null)}
              disabled={sectionLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSection}
              disabled={sectionLoading || !sectionTitle.trim()}
            >
              {sectionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Section Dialog ─────────────────────────── */}
      <Dialog
        open={!!deletingSection}
        onOpenChange={(open) => !open && setDeletingSection(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Section</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{deletingSection?.title}&rdquo;?
            This will also delete all {deletingSection?.lectures.length ?? 0}{" "}
            lecture{(deletingSection?.lectures.length ?? 0) !== 1 ? "s" : ""} in
            this section. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingSection(null)}
              disabled={sectionLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSection}
              disabled={sectionLoading}
            >
              {sectionLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Add Lecture Dialog ─────────────────────────────── */}
      <Dialog
        open={!!addLectureToSection}
        onOpenChange={(open) => {
          if (!open) {
            setIsVideoUploading(false)
            setAddLectureToSection(null)
          }
        }}
      >
        <DialogContent className={cn("max-w-lg", lectureType === "QUIZ" && "max-w-2xl")}>
          <DialogHeader>
            <DialogTitle>Add Lecture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Introduction to React"
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="What will students learn in this lecture?"
                value={lectureDesc}
                onChange={(e) => setLectureDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={lectureType}
                onValueChange={(v) => setLectureType(v as typeof lectureType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="QUIZ">Quiz</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="HTML">HTML</SelectItem>
                  <SelectItem value="SCORM">SCORM package</SelectItem>
                  <SelectItem value="XAPI">xAPI launch</SelectItem>
                  <SelectItem value="VOICE_OVER_SLIDES">Voice-over slides</SelectItem>
                  <SelectItem value="DOWNLOADABLE">Downloadable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {lectureType === "VIDEO" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Video</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="free-preview-add"
                        checked={lectureIsFree}
                        onCheckedChange={setLectureIsFree}
                      />
                      <Label htmlFor="free-preview-add" className="text-sm">
                        Free Preview
                      </Label>
                    </div>
                  </div>
                  <VideoUpload
                    onUploadComplete={(data) => {
                      setVideoData(data)
                      setIsVideoUploading(false)
                    }}
                    onUploadStart={() => setIsVideoUploading(true)}
                    onUploadCancel={() => setIsVideoUploading(false)}
                    disabled={lectureLoading}
                  />
                </div>
              </>
            )}
            {lectureType === "TEXT" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    placeholder="Write the lecture content here..."
                    value={lectureContent}
                    onChange={(e) => setLectureContent(e.target.value)}
                    rows={8}
                    className="min-h-[200px]"
                  />
                </div>
              </>
            )}
            {lectureType === "QUIZ" && (
              <>
                <Separator />
                <QuizBuilder
                  value={lectureContent}
                  onChange={setLectureContent}
                  disabled={lectureLoading}
                />
              </>
            )}
            {isPayloadType(lectureType) && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <Switch
                    id={`payload-free-${lectureType}`}
                    checked={lectureIsFree}
                    onCheckedChange={setLectureIsFree}
                  />
                  <Label htmlFor={`payload-free-${lectureType}`} className="text-sm">
                    Free Preview
                  </Label>
                </div>
                <LecturePayloadEditor
                  type={lectureType}
                  value={lecturePayload}
                  onChange={setLecturePayload}
                  disabled={lectureLoading}
                  academyId={academyId ?? null}
                  courseId={courseId}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddLectureToSection(null)}
              disabled={lectureLoading || isVideoUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddLecture}
              disabled={lectureLoading || !lectureTitle.trim() || isVideoUploading}
            >
              {lectureLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Lecture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Edit Lecture Dialog ────────────────────────────── */}
      <Dialog
        open={!!editingLecture}
        onOpenChange={(open) => {
          if (!open) {
            setIsVideoUploading(false)
            setEditingLecture(null)
          }
        }}
      >
        <DialogContent className={cn("max-w-lg", lectureType === "QUIZ" && "max-w-2xl")}>
          <DialogHeader>
            <DialogTitle>Edit Lecture</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={lectureTitle}
                onChange={(e) => setLectureTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={lectureDesc}
                onChange={(e) => setLectureDesc(e.target.value)}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={lectureType}
                onValueChange={(v) => setLectureType(v as typeof lectureType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIDEO">Video</SelectItem>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="QUIZ">Quiz</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="HTML">HTML</SelectItem>
                  <SelectItem value="SCORM">SCORM package</SelectItem>
                  <SelectItem value="XAPI">xAPI launch</SelectItem>
                  <SelectItem value="VOICE_OVER_SLIDES">Voice-over slides</SelectItem>
                  <SelectItem value="DOWNLOADABLE">Downloadable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {lectureType === "VIDEO" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Video</Label>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="free-preview-edit"
                        checked={lectureIsFree}
                        onCheckedChange={setLectureIsFree}
                      />
                      <Label htmlFor="free-preview-edit" className="text-sm">
                        Free Preview
                      </Label>
                    </div>
                  </div>
                  <VideoUpload
                    onUploadComplete={(data) => {
                      setVideoData(data)
                      setIsVideoUploading(false)
                    }}
                    onUploadStart={() => setIsVideoUploading(true)}
                    onUploadCancel={() => setIsVideoUploading(false)}
                    existingVideoUrl={editingLecture?.lecture.videoUrl}
                    existingThumbnail={getThumbnailUrl(
                      editingLecture?.lecture.videoPublicId ?? null
                    )}
                    title={editingLecture?.lecture.title}
                    disabled={lectureLoading}
                  />
                </div>
              </>
            )}
            {lectureType === "TEXT" && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Content</Label>
                  <Textarea
                    placeholder="Write the lecture content here..."
                    value={lectureContent}
                    onChange={(e) => setLectureContent(e.target.value)}
                    rows={8}
                    className="min-h-[200px]"
                  />
                </div>
              </>
            )}
            {lectureType === "QUIZ" && (
              <>
                <Separator />
                <QuizBuilder
                  value={lectureContent}
                  onChange={setLectureContent}
                  disabled={lectureLoading}
                />
              </>
            )}
            {isPayloadType(lectureType) && (
              <>
                <Separator />
                <div className="flex items-center gap-3">
                  <Switch
                    id={`payload-free-${lectureType}`}
                    checked={lectureIsFree}
                    onCheckedChange={setLectureIsFree}
                  />
                  <Label htmlFor={`payload-free-${lectureType}`} className="text-sm">
                    Free Preview
                  </Label>
                </div>
                <LecturePayloadEditor
                  type={lectureType}
                  value={lecturePayload}
                  onChange={setLecturePayload}
                  disabled={lectureLoading}
                  academyId={academyId ?? null}
                  courseId={courseId}
                />
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingLecture(null)}
              disabled={lectureLoading || isVideoUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditLecture}
              disabled={lectureLoading || !lectureTitle.trim() || isVideoUploading}
            >
              {lectureLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Lecture Dialog ──────────────────────────── */}
      <Dialog
        open={!!deletingLecture}
        onOpenChange={(open) => !open && setDeletingLecture(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Lecture</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete &ldquo;{deletingLecture?.lecture.title}
            &rdquo;? {deletingLecture?.lecture.videoUrl &&
              "The associated video will also be removed from storage. "}
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingLecture(null)}
              disabled={lectureLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLecture}
              disabled={lectureLoading}
            >
              {lectureLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Lecture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
