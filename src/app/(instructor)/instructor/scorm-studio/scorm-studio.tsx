"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Upload,
  Film,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  MinusCircle,
  Download,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  Link2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type CourseOption = {
  id: string
  title: string
  status: string
  sections: { id: string; title: string }[]
}

type StepTrace = {
  id: string
  label: string
  status: "pending" | "running" | "done" | "failed" | "skipped"
  detail?: string
  durationMs?: number
}

type ValidationCheck = { id: string; label: string; status: "pass" | "warn" | "fail"; detail?: string }

type Job = {
  id: string
  title: string
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED"
  currentStep: string | null
  stepsJson: StepTrace[] | null
  errorMessage: string | null
  packageUrl: string | null
  entryPoint: string | null
  zipUrl: string | null
  lectureId: string | null
  courseId: string | null
  model: string | null
  videoDurationSeconds: number | null
  validationJson: { ok: boolean; checks: ValidationCheck[]; summary: { pass: number; warn: number; fail: number } } | null
  createdAt: string
}

type JobSummary = Pick<Job, "id" | "title" | "status" | "packageUrl" | "zipUrl" | "lectureId" | "courseId" | "model" | "createdAt" | "errorMessage">

interface Props {
  academyId: string | null
  academyName: string | null
  aiEnabled: boolean
  courses: CourseOption[]
  initialCourseId: string | null
  initialSectionId: string | null
}

const NONE = "__none__"

export function ScormStudio({ academyId, academyName, aiEnabled, courses, initialCourseId, initialSectionId }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [audience, setAudience] = useState("")
  const [transcript, setTranscript] = useState("")
  const [topicCount, setTopicCount] = useState(4)
  const [questionCount, setQuestionCount] = useState(5)
  const [passMark, setPassMark] = useState(80)
  const [courseId, setCourseId] = useState<string>(initialCourseId ?? NONE)
  const [sectionId, setSectionId] = useState<string>(initialSectionId ?? NONE)
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [job, setJob] = useState<Job | null>(null)
  const [history, setHistory] = useState<JobSummary[]>([])
  const [attaching, setAttaching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const course = useMemo(() => courses.find((c) => c.id === courseId) ?? null, [courses, courseId])

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/scorm/jobs${academyId ? `?academyId=${academyId}` : ""}`)
      if (res.ok) {
        const json = await res.json()
        setHistory(json.data ?? [])
      }
    } catch {
      // non-fatal
    }
  }, [academyId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }

  const pollJob = useCallback(
    (id: string) => {
      stopPolling()
      const tick = async () => {
        try {
          const res = await fetch(`/api/scorm/jobs/${id}`, { cache: "no-store" })
          if (!res.ok) return
          const json = await res.json()
          const next = json.data as Job
          setJob(next)
          if (next.status === "SUCCEEDED" || next.status === "FAILED") {
            stopPolling()
            loadHistory()
            if (next.status === "SUCCEEDED") toast.success("SCORM package ready")
            else toast.error(next.errorMessage ?? "Build failed")
          }
        } catch {
          // keep polling
        }
      }
      tick()
      pollRef.current = setInterval(tick, 2000)
    },
    [loadHistory]
  )

  useEffect(() => () => stopPolling(), [])

  const onPickFile = (f: File | null) => {
    setFile(f)
    if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "))
  }

  const submit = async () => {
    if (!file) return toast.error("Choose a video first")
    if (title.trim().length < 2) return toast.error("Give the module a title")
    if (!academyId) return toast.error("No academy context — ask an Academy Admin to add you as a Course Developer")

    const form = new FormData()
    form.append("video", file)
    form.append("title", title.trim())
    form.append("description", description.trim())
    form.append("audience", audience.trim())
    form.append("transcript", transcript.trim())
    form.append("topicCount", String(topicCount))
    form.append("questionCount", String(questionCount))
    form.append("passMark", String(passMark))
    form.append("academyId", academyId)
    if (courseId !== NONE && sectionId !== NONE) {
      form.append("courseId", courseId)
      form.append("sectionId", sectionId)
    }

    setUploading(true)
    setUploadPct(0)
    setJob(null)
    try {
      const id = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener("load", () => {
          try {
            const body = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300) resolve(body.data.id)
            else reject(new Error(body.error ?? `Upload failed (${xhr.status})`))
          } catch {
            reject(new Error(`Upload failed (${xhr.status})`))
          }
        })
        xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
        xhr.open("POST", "/api/scorm/jobs")
        xhr.send(form)
      })
      toast.success("Video uploaded — building your SCORM package")
      pollJob(id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const attach = async () => {
    if (!job || courseId === NONE || sectionId === NONE) return toast.error("Pick a course and section first")
    setAttaching(true)
    try {
      const res = await fetch(`/api/scorm/jobs/${job.id}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, sectionId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "Attach failed")
      setJob({ ...job, lectureId: body.data.lectureId, courseId })
      toast.success("SCORM lecture added to the course")
      loadHistory()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Attach failed")
    } finally {
      setAttaching(false)
    }
  }

  const steps = job?.stepsJson ?? []
  const doneCount = steps.filter((s) => s.status === "done" || s.status === "skipped").length
  const busy = uploading || job?.status === "QUEUED" || job?.status === "RUNNING"
  const previewUrl = job?.packageUrl ? `${job.packageUrl}${job.entryPoint ?? "index.html"}` : null

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> SCORM Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Upload a lecture video and the AI agent designs an interactive module around it — learning
            outcomes, topics with knowledge checks and a scored assessment — then renders, validates and
            packages it as <strong>SCORM 1.2</strong> you can attach to a lecture or import into any LMS.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
          {academyName && <span>Academy: <strong className="text-foreground">{academyName}</strong></span>}
          <Badge variant={aiEnabled ? "secondary" : "outline"} className="gap-1">
            {aiEnabled ? <Sparkles className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {aiEnabled ? "AI design: OpenAI → DeepSeek" : "AI disabled — template design"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Form */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">1. Video and module brief</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "rounded-lg border-2 border-dashed p-6 text-center cursor-pointer transition-colors",
                file ? "border-emerald-300 bg-emerald-50/40" : "border-muted-foreground/30 hover:border-primary/60"
              )}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                onPickFile(e.dataTransfer.files?.[0] ?? null)
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov"
                className="hidden"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center justify-center gap-3 text-sm">
                  <Film className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
                  <p className="text-sm font-medium">Drop a video here or click to browse</p>
                  <p className="text-xs text-muted-foreground">MP4 (H.264) recommended · up to 500MB</p>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="title">Module title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Workplace Security Awareness" disabled={busy} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="description">What the video covers</Label>
                <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Two or three sentences describing the content. The AI uses this to ground every topic and question." disabled={busy} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="audience">Audience (optional)</Label>
                <Input id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. New site staff and contractors" disabled={busy} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="transcript">Transcript or speaker notes (optional, strongly recommended)</Label>
                <Textarea id="transcript" rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the narration script or auto-captions. Up to 60,000 characters." disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="topics">Topics</Label>
                <Input id="topics" type="number" min={1} max={10} value={topicCount} onChange={(e) => setTopicCount(Number(e.target.value) || 1)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="questions">Assessment questions</Label>
                <Input id="questions" type="number" min={1} max={20} value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value) || 1)} disabled={busy} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="passmark">Pass mark (%)</Label>
                <Input id="passmark" type="number" min={1} max={100} value={passMark} onChange={(e) => setPassMark(Number(e.target.value) || 80)} disabled={busy} />
              </div>
            </div>

            <div className="rounded-md border p-3 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Attach to a course (optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Select value={courseId} onValueChange={(v) => { setCourseId(v); setSectionId(NONE) }} disabled={busy}>
                  <SelectTrigger><SelectValue placeholder="Course" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No course — just build the package</SelectItem>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.title}{c.status !== "DRAFT" ? ` (${c.status.toLowerCase()})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sectionId} onValueChange={setSectionId} disabled={busy || !course || course.sections.length === 0}>
                  <SelectTrigger><SelectValue placeholder={course ? (course.sections.length ? "Section" : "No sections yet") : "Pick a course first"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Choose a section</SelectItem>
                    {course?.sections.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                When a section is selected the agent adds a SCORM lecture automatically after validation passes.
              </p>
            </div>

            {uploading && (
              <div className="space-y-1">
                <Progress value={uploadPct} />
                <p className="text-xs text-muted-foreground">Uploading video… {uploadPct}%</p>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={submit} disabled={busy || !file}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {uploading ? "Uploading…" : job && (job.status === "RUNNING" || job.status === "QUEUED") ? "Building…" : "Build SCORM 1.2 package"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Trace */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>2. Agent run</span>
              {job && (
                <Badge variant={job.status === "SUCCEEDED" ? "default" : job.status === "FAILED" ? "destructive" : "secondary"} className={cn(job.status === "SUCCEEDED" && "bg-emerald-600")}>
                  {job.status.toLowerCase()}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!job ? (
              <p className="text-sm text-muted-foreground">
                The run trace appears here: video probe → AI design → review → render → manifest → SCORM 1.2 validation → publish → attach.
              </p>
            ) : (
              <>
                {steps.length > 0 && <Progress value={Math.round((doneCount / steps.length) * 100)} />}
                <ol className="space-y-2">
                  {steps.map((s) => (
                    <li key={s.id} className="flex gap-2 text-sm">
                      <span className="mt-0.5 shrink-0">
                        {s.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                        {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                        {s.status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
                        {s.status === "skipped" && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                        {s.status === "pending" && <Circle className="h-4 w-4 text-muted-foreground/40" />}
                      </span>
                      <div className="min-w-0">
                        <p className={cn("font-medium", s.status === "pending" && "text-muted-foreground")}>{s.label}</p>
                        {s.detail && <p className="text-xs text-muted-foreground break-words">{s.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
                {job.status === "FAILED" && job.errorMessage && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive break-words">{job.errorMessage}</div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Result */}
      {job?.status === "SUCCEEDED" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> 3. Package ready — SCORM 1.2 validated</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {job.zipUrl && (
                <Button asChild variant="default">
                  <a href={job.zipUrl} download><Download className="h-4 w-4 mr-2" /> Download SCORM ZIP</a>
                </Button>
              )}
              {previewUrl && (
                <Button asChild variant="outline">
                  <a href={previewUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4 mr-2" /> Preview module</a>
                </Button>
              )}
              {job.lectureId && job.courseId ? (
                <Button asChild variant="outline">
                  <Link href={`/instructor/courses/${job.courseId}`}><Link2 className="h-4 w-4 mr-2" /> Open course editor</Link>
                </Button>
              ) : (
                <Button variant="outline" onClick={attach} disabled={attaching || courseId === NONE || sectionId === NONE}>
                  {attaching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                  Attach to selected section
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
              <p>Package URL: <code className="bg-muted px-1 rounded break-all">{job.packageUrl}</code></p>
              <p>Design model: <code className="bg-muted px-1 rounded">{job.model ?? "—"}</code></p>
            </div>
            {job.validationJson && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Conformance report — {job.validationJson.summary.pass} passed, {job.validationJson.summary.warn} warnings, {job.validationJson.summary.fail} failed
                </p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {job.validationJson.checks.map((c) => (
                    <li key={c.id} className="flex gap-2 text-xs">
                      {c.status === "pass" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" /> : c.status === "warn" ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" /> : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />}
                      <span>
                        {c.label}
                        {c.detail && <span className="text-muted-foreground"> — {c.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent builds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {history.map((h) => (
                <li key={h.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{h.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString()} · {h.model ?? "—"}
                      {h.errorMessage ? ` · ${h.errorMessage.slice(0, 80)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={cn(h.status === "SUCCEEDED" && "border-emerald-300 text-emerald-700", h.status === "FAILED" && "border-destructive/50 text-destructive")}>
                      {h.status.toLowerCase()}
                    </Badge>
                    {h.status === "SUCCEEDED" || h.status === "FAILED" ? (
                      <Button size="sm" variant="ghost" onClick={() => pollJob(h.id)}>View</Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => pollJob(h.id)}>Follow</Button>
                    )}
                    {h.zipUrl && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={h.zipUrl} download><Download className="h-4 w-4" /></a>
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
