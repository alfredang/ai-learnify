"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2, FileUp, Eye, Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AiAssistButton } from "@/components/shared/ai-assist-button"
import { SlidePlayer, type VoiceOverSlidesPayload } from "@/components/courses/slide-player"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type PayloadLectureType =
  | "PDF"
  | "SCORM"
  | "XAPI"
  | "VOICE_OVER_SLIDES"
  | "DOWNLOADABLE"
  | "HTML"

export type LecturePayload = Record<string, unknown> | null

interface Props {
  type: PayloadLectureType
  value: LecturePayload
  onChange: (next: LecturePayload) => void
  disabled?: boolean
  academyId?: string | null
  courseId?: string
}

export function LecturePayloadEditor({
  type,
  value,
  onChange,
  disabled,
  academyId,
  courseId,
}: Props) {
  switch (type) {
    case "PDF":
      return <PdfPayloadEditor value={value} onChange={onChange} disabled={disabled} />
    case "SCORM":
      return (
        <ScormPayloadEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          courseId={courseId}
        />
      )
    case "XAPI":
      return <XapiPayloadEditor value={value} onChange={onChange} disabled={disabled} />
    case "VOICE_OVER_SLIDES":
      return (
        <VoiceOverSlidesPayloadEditor
          value={value}
          onChange={onChange}
          disabled={disabled}
          academyId={academyId ?? null}
          courseId={courseId}
        />
      )
    case "DOWNLOADABLE":
      return <DownloadablePayloadEditor value={value} onChange={onChange} disabled={disabled} />
    case "HTML":
      return <HtmlPayloadEditor value={value} onChange={onChange} disabled={disabled} />
    default:
      return null
  }
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

function SectionHeader({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <div className="space-y-0.5">
      <h4 className="text-sm font-semibold">{title}</h4>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  )
}

// ─── PDF ──────────────────────────────────────────────────────

function PdfPayloadEditor({
  value,
  onChange,
  disabled,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
}) {
  const pdfUrl = (value?.pdfUrl as string | undefined) ?? ""

  return (
    <div className="space-y-3">
      <SectionHeader
        title="PDF document"
        description="Link to a hosted PDF. The learner can view it inline and download it."
      />
      <div className="space-y-2">
        <Label htmlFor="pdf-url">PDF URL</Label>
        <Input
          id="pdf-url"
          type="url"
          placeholder="https://cdn.example.com/lecture-notes.pdf"
          value={pdfUrl}
          onChange={(e) => onChange({ pdfUrl: e.target.value })}
          disabled={disabled}
        />
        <FieldHint>
          Host the PDF on Cloudinary, S3, or any public URL. HTTPS is required for inline embedding.
        </FieldHint>
      </div>
    </div>
  )
}

// ─── SCORM ────────────────────────────────────────────────────

function ScormPayloadEditor({
  value,
  onChange,
  disabled,
  courseId,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
  courseId?: string
}) {
  const packageUrl = (value?.packageUrl as string | undefined) ?? ""
  const entryPoint = (value?.entryPoint as string | undefined) ?? ""
  const version =
    (value?.version as "SCORM_1_2" | "SCORM_2004" | undefined) ?? "SCORM_1_2"

  return (
    <div className="space-y-3">
      <SectionHeader
        title="SCORM package"
        description="Host an unpacked SCORM 1.2 / 2004 package. The package URL is the folder root that contains imsmanifest.xml."
      />
      <div className="rounded-md border border-dashed p-3 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">
          Have a video but no SCORM package yet? SCORM Studio builds a validated SCORM 1.2 module around it with AI.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href={courseId ? `/instructor/scorm-studio?courseId=${courseId}` : "/instructor/scorm-studio"}>
            <Sparkles className="h-4 w-4 mr-1" /> Open SCORM Studio
          </Link>
        </Button>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scorm-version">SCORM version</Label>
        <Select
          value={version}
          onValueChange={(v) =>
            onChange({ ...(value ?? {}), version: v })
          }
          disabled={disabled}
        >
          <SelectTrigger id="scorm-version" className="max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SCORM_1_2">SCORM 1.2</SelectItem>
            <SelectItem value="SCORM_2004">SCORM 2004 (3rd / 4th edition)</SelectItem>
          </SelectContent>
        </Select>
        <FieldHint>
          Pick the version your package was authored for. Both runtimes are supported.
        </FieldHint>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scorm-package-url">Package URL</Label>
        <Input
          id="scorm-package-url"
          type="url"
          placeholder="https://cdn.example.com/scorm/my-course/"
          value={packageUrl}
          onChange={(e) =>
            onChange({ ...(value ?? {}), packageUrl: e.target.value })
          }
          disabled={disabled}
        />
        <FieldHint>
          Trailing slash recommended. The URL must be CORS-enabled and serve the package&apos;s <code>imsmanifest.xml</code> from the same path.
        </FieldHint>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scorm-entry">Entry point (optional)</Label>
        <Input
          id="scorm-entry"
          placeholder="index.html"
          value={entryPoint}
          onChange={(e) =>
            onChange({ ...(value ?? {}), entryPoint: e.target.value })
          }
          disabled={disabled}
        />
        <FieldHint>
          Path to the launch HTML, relative to the package URL. Defaults to <code>index.html</code> if blank.
        </FieldHint>
      </div>
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
        <strong>CMI tracking is on.</strong> Score, completion status, lesson location, and suspend data are committed to the LMS automatically. The lecture is marked complete as soon as the package reports <code>passed</code> or <code>completed</code>.
      </div>
    </div>
  )
}

// ─── xAPI ─────────────────────────────────────────────────────

function XapiPayloadEditor({
  value,
  onChange,
  disabled,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
}) {
  const launchUrl = (value?.launchUrl as string | undefined) ?? ""
  const activityId = (value?.activityId as string | undefined) ?? ""

  return (
    <div className="space-y-3">
      <SectionHeader
        title="xAPI activity"
        description="Launches an xAPI-compliant activity. Statements should POST to /api/xapi/statements."
      />
      <div className="space-y-2">
        <Label htmlFor="xapi-launch-url">Launch URL</Label>
        <Input
          id="xapi-launch-url"
          type="url"
          placeholder="https://content.example.com/launch?activityId=abc"
          value={launchUrl}
          onChange={(e) =>
            onChange({ ...(value ?? {}), launchUrl: e.target.value })
          }
          disabled={disabled}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="xapi-activity-id">Activity ID (IRI)</Label>
        <Input
          id="xapi-activity-id"
          placeholder="https://learnify.local/activities/abc"
          value={activityId}
          onChange={(e) =>
            onChange({ ...(value ?? {}), activityId: e.target.value })
          }
          disabled={disabled}
        />
        <FieldHint>
          Used as the <code>object.id</code> in xAPI statements.
        </FieldHint>
      </div>
    </div>
  )
}

// ─── Voice-over slides ────────────────────────────────────────

interface SlideRow {
  page: number
  voText: string
}

function VoiceOverSlidesPayloadEditor({
  value,
  onChange,
  disabled,
  academyId,
  courseId,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
  academyId: string | null
  courseId?: string
}) {
  const pdfUrl = (value?.pdfUrl as string | undefined) ?? ""
  const slides = useMemo<SlideRow[]>(
    () =>
      Array.isArray(value?.slides)
        ? (value!.slides as unknown[])
            .filter((s): s is SlideRow => {
              return (
                !!s &&
                typeof s === "object" &&
                "page" in s &&
                typeof (s as SlideRow).page === "number"
              )
            })
            .sort((a, b) => a.page - b.page)
        : [],
    [value]
  )
  const [previewOpen, setPreviewOpen] = useState(false)

  function updateSlides(next: SlideRow[]) {
    onChange({ ...(value ?? {}), pdfUrl, slides: next })
  }

  function addSlide() {
    const nextPage =
      slides.length > 0 ? Math.max(...slides.map((s) => s.page)) + 1 : 1
    updateSlides([...slides, { page: nextPage, voText: "" }])
  }

  function updateSlide(index: number, patch: Partial<SlideRow>) {
    const next = [...slides]
    next[index] = { ...next[index], ...patch }
    updateSlides(next)
  }

  function removeSlide(index: number) {
    const next = slides.filter((_, i) => i !== index)
    updateSlides(next)
  }

  function handleAiAccept(draft: { rawText: string; parsed: unknown | null }) {
    // The VOICE_OVER capability returns a JSON array of { page, voText } —
    // try parsed first, fall back to splitting the raw text by line.
    if (Array.isArray(draft.parsed)) {
      const generated = (draft.parsed as unknown[])
        .filter((s): s is SlideRow => {
          return (
            !!s &&
            typeof s === "object" &&
            "page" in (s as Record<string, unknown>) &&
            "voText" in (s as Record<string, unknown>) &&
            typeof (s as { page: unknown }).page === "number" &&
            typeof (s as { voText: unknown }).voText === "string"
          )
        })
      if (generated.length > 0) {
        updateSlides(generated)
        return
      }
    }
    // Fallback: each non-empty line becomes one slide.
    const lines = draft.rawText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    if (lines.length === 0) return
    updateSlides(lines.map((voText, idx) => ({ page: idx + 1, voText })))
  }

  const previewPayload: VoiceOverSlidesPayload | null =
    pdfUrl && slides.length > 0 ? { pdfUrl, slides } : null

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Voice-over slides"
        description="Upload a slide deck as PDF and add per-page voice-over text. The learner sees one slide at a time and the browser reads the text aloud."
      />
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <strong>Need to upload PPT or PPTX?</strong> Export to PDF first — every major tool (PowerPoint, Keynote, Google Slides) supports PDF export. We use PDF to render slides reliably in the browser.
      </div>
      <div className="space-y-2">
        <Label htmlFor="vos-pdf-url">PDF URL</Label>
        <Input
          id="vos-pdf-url"
          type="url"
          placeholder="https://cdn.example.com/slides.pdf"
          value={pdfUrl}
          onChange={(e) =>
            onChange({ ...(value ?? {}), pdfUrl: e.target.value, slides })
          }
          disabled={disabled}
        />
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm">Slide voice-over scripts</Label>
        <div className="flex items-center gap-2">
          {academyId && (
            <AiAssistButton
              capability="VOICE_OVER"
              academyId={academyId}
              label="Draft slide voice-over scripts"
              description="Describe the deck so the AI can draft voice-over text for each slide."
              placeholder="e.g. 12-slide intro to React hooks. Slide 1 is the title, slides 2–5 cover useState, 6–9 cover useEffect, 10–12 are summary."
              context={courseId ? { courseId } : undefined}
              onAccept={handleAiAccept}
              buttonLabel="AI Assist"
              buttonClassName="h-8"
            />
          )}
          {previewPayload && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={disabled}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Preview
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addSlide}
            disabled={disabled}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add slide
          </Button>
        </div>
      </div>
      <FieldHint>
        Page numbers should match your PDF (1-indexed). Blank text is fine — completion only requires the learner to visit each slide.
      </FieldHint>

      {slides.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No slides yet. Click <strong>Add slide</strong> to start, or use AI Assist to draft them all at once.
        </div>
      ) : (
        <div className="space-y-2">
          {slides.map((slide, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded-md border p-3"
            >
              <div className="w-16 shrink-0 space-y-1">
                <Label className="text-xs">Page</Label>
                <Input
                  type="number"
                  min={1}
                  value={slide.page}
                  onChange={(e) =>
                    updateSlide(idx, {
                      page: Math.max(1, parseInt(e.target.value) || 1),
                    })
                  }
                  disabled={disabled}
                  className="h-8"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Voice-over text</Label>
                <Textarea
                  value={slide.voText}
                  onChange={(e) => updateSlide(idx, { voText: e.target.value })}
                  placeholder="What the learner hears on this slide..."
                  rows={3}
                  disabled={disabled}
                  className="text-sm"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSlide(idx)}
                disabled={disabled}
                className="text-muted-foreground hover:text-destructive shrink-0 mt-5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {previewPayload && (
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Slide preview</DialogTitle>
            </DialogHeader>
            <div className="-mx-6 -mb-6">
              <SlidePlayer
                payload={previewPayload}
                title="Preview"
                alreadyCompleted={true}
                onAllSlidesVisited={() => {}}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

// ─── Downloadable ─────────────────────────────────────────────

interface DownloadableFile {
  name: string
  url: string
  sizeBytes?: number
}

function DownloadablePayloadEditor({
  value,
  onChange,
  disabled,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
}) {
  const files = useMemo<DownloadableFile[]>(
    () =>
      Array.isArray(value?.files)
        ? (value!.files as unknown[])
            .filter((f): f is DownloadableFile => {
              return (
                !!f &&
                typeof f === "object" &&
                "name" in f &&
                "url" in f &&
                typeof (f as DownloadableFile).name === "string" &&
                typeof (f as DownloadableFile).url === "string"
              )
            })
        : [],
    [value]
  )

  function updateFiles(next: DownloadableFile[]) {
    onChange({ files: next })
  }

  function addFile() {
    updateFiles([...files, { name: "", url: "" }])
  }

  function updateFile(index: number, patch: Partial<DownloadableFile>) {
    const next = [...files]
    next[index] = { ...next[index], ...patch }
    updateFiles(next)
  }

  function removeFile(index: number) {
    updateFiles(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Downloadable resources"
        description="Files learners can download from this lecture (workbooks, reference guides, datasets). Completion is manual."
      />
      <div className="flex justify-between items-center">
        <Label className="text-sm">Files</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addFile}
          disabled={disabled}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add file
        </Button>
      </div>

      {files.length === 0 ? (
        <div className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No downloadable files yet.
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div key={idx} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  value={file.name}
                  onChange={(e) => updateFile(idx, { name: e.target.value })}
                  placeholder="Display name (e.g. Workbook.pdf)"
                  disabled={disabled}
                  className="h-8"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFile(idx)}
                  disabled={disabled}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                type="url"
                value={file.url}
                onChange={(e) => updateFile(idx, { url: e.target.value })}
                placeholder="https://cdn.example.com/file.pdf"
                disabled={disabled}
                className="h-8 text-xs font-mono"
              />
              <Input
                type="number"
                min={0}
                value={file.sizeBytes ?? ""}
                onChange={(e) =>
                  updateFile(idx, {
                    sizeBytes: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                placeholder="Size in bytes (optional)"
                disabled={disabled}
                className="h-8 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── HTML ─────────────────────────────────────────────────────

function HtmlPayloadEditor({
  value,
  onChange,
  disabled,
}: {
  value: LecturePayload
  onChange: (v: LecturePayload) => void
  disabled?: boolean
}) {
  const html = (value?.html as string | undefined) ?? ""
  const [showPreview, setShowPreview] = useState(false)

  return (
    <div className="space-y-3">
      <SectionHeader
        title="HTML content"
        description="Custom HTML rendered in a sandboxed iframe. Scripts run, but the iframe cannot access cookies, storage, or the parent page."
      />
      <div className="flex items-center justify-between">
        <Label htmlFor="html-content">HTML markup</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((s) => !s)}
        >
          {showPreview ? "Edit" : "Preview"}
        </Button>
      </div>
      {showPreview ? (
        <div className="rounded-md border overflow-hidden bg-white">
          <iframe
            title="HTML preview"
            sandbox="allow-scripts"
            srcDoc={html}
            className="w-full min-h-[280px]"
          />
        </div>
      ) : (
        <Textarea
          id="html-content"
          value={html}
          onChange={(e) => onChange({ html: e.target.value })}
          placeholder={'<h1>Hello</h1>\n<p>Custom HTML lecture content...</p>'}
          rows={12}
          disabled={disabled}
          className="font-mono text-xs min-h-[280px]"
        />
      )}
      <FieldHint>
        Avoid pasting untrusted HTML — even sandboxed scripts can phish learners. Inline CSS is fine; external resources must use HTTPS.
      </FieldHint>
    </div>
  )
}
