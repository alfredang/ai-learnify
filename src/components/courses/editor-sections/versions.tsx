"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  History,
  Loader2,
  CameraIcon,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface VersionRow {
  id: string
  versionNumber: number
  publishedAt: string
  publishedBy: { id: string; name: string | null; email: string }
}

interface Props {
  courseId: string
  onSaved: () => void
}

async function fetchVersions(courseId: string): Promise<VersionRow[]> {
  const res = await fetch(`/api/courses/${courseId}/versions`)
  if (!res.ok) throw new Error("Failed to load version history")
  const json = await res.json()
  return json.versions
}

export function VersionsSection({ courseId, onSaved }: Props) {
  const [snapshotting, setSnapshotting] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["course-versions", courseId],
    queryFn: () => fetchVersions(courseId),
  })

  async function handleSnapshot() {
    setSnapshotting(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/versions`, {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Snapshot failed")
      }
      toast.success("Snapshot created")
      await refetch()
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Snapshot failed")
    } finally {
      setSnapshotting(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Version history</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Read-only snapshots of this course. Each time you publish, a snapshot is captured automatically. Enrolled learners see the version they purchased.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleSnapshot}
          disabled={snapshotting}
        >
          {snapshotting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CameraIcon className="h-4 w-4 mr-2" />
          )}
          Snapshot now
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
          No snapshots yet. Publish your course to capture the first one.
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {data.map((v) => (
            <VersionRow
              key={v.id}
              courseId={courseId}
              version={v}
              expanded={expanded === v.id}
              onToggle={() => setExpanded(expanded === v.id ? null : v.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VersionRow({
  courseId,
  version,
  expanded,
  onToggle,
}: {
  courseId: string
  version: VersionRow
  expanded: boolean
  onToggle: () => void
}) {
  const [snapshot, setSnapshot] = useState<unknown>(null)
  const [previous, setPrevious] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)

  async function loadSnapshot() {
    if (snapshot || loading) return
    setLoading(true)
    try {
      // Fetch the current version's snapshot.
      const currRes = await fetch(
        `/api/courses/${courseId}/versions/${version.versionNumber}`
      )
      if (currRes.ok) {
        const json = await currRes.json()
        setSnapshot(json.version?.snapshotJson ?? null)
      }
      // And the previous version, so we can compute a diff. v1 has none.
      if (version.versionNumber > 1) {
        const prevRes = await fetch(
          `/api/courses/${courseId}/versions/${version.versionNumber - 1}`
        )
        if (prevRes.ok) {
          const json = await prevRes.json()
          setPrevious(json.version?.snapshotJson ?? null)
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  function handleClick() {
    onToggle()
    if (!expanded) loadSnapshot()
  }

  const date = new Date(version.publishedAt)
  const author = version.publishedBy?.name || version.publishedBy?.email

  return (
    <div className="px-4 py-3">
      <button
        type="button"
        onClick={handleClick}
        className="flex items-center gap-3 w-full text-left hover:bg-muted/40 -mx-4 px-4 py-1 transition-colors rounded"
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <Badge variant="secondary" className="font-mono text-xs">
          v{version.versionNumber}
        </Badge>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            <span className="text-muted-foreground">
              · {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Published by {author}
          </p>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 pl-7 space-y-4">
          {loading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading snapshot...
            </div>
          ) : snapshot ? (
            <>
              <ChangeList
                versionNumber={version.versionNumber}
                current={snapshot}
                previous={previous}
              />
              <SnapshotSummary snapshot={snapshot} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Snapshot data unavailable.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ChangeList({
  versionNumber,
  current,
  previous,
}: {
  versionNumber: number
  current: unknown
  previous: unknown
}) {
  // First version → nothing to diff against.
  if (versionNumber === 1 || !previous) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs">
        <p className="font-semibold text-emerald-900">Initial publication</p>
        <p className="text-emerald-800 mt-0.5">
          This is the first published version of the course.
        </p>
      </div>
    )
  }

  const diffs = diffSnapshots(
    previous as Record<string, unknown>,
    current as Record<string, unknown>
  )

  if (diffs.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-xs">
        <p className="text-muted-foreground">
          No detectable changes from v{versionNumber - 1}. (The republish was likely
          status-only or affected fields not tracked here.)
        </p>
      </div>
    )
  }

  // Group diffs by editor section so they line up with the sidebar.
  const SECTION_ORDER: DiffSection[] = [
    "Intended learners",
    "Curriculum",
    "Assessment rules",
    "Course landing page",
    "Survey",
  ]
  const grouped = new Map<DiffSection, Diff[]>()
  for (const d of diffs) {
    const arr = grouped.get(d.section) ?? []
    arr.push(d)
    grouped.set(d.section, arr)
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
      <p className="text-xs font-semibold text-blue-900">
        Changes from v{versionNumber - 1}
      </p>
      <div className="space-y-3">
        {SECTION_ORDER.filter((s) => grouped.has(s)).map((section) => {
          const items = grouped.get(section)!
          return (
            <div key={section} className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide font-semibold text-blue-800">
                {section}
              </p>
              <ul className="space-y-1 text-xs pl-2">
                {items.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span
                      className={`shrink-0 mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${
                        d.kind === "added"
                          ? "bg-emerald-500"
                          : d.kind === "removed"
                            ? "bg-red-500"
                            : "bg-amber-500"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground">{d.field}:</span>{" "}
                      <span className="text-muted-foreground">{d.detail}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type DiffSection =
  | "Intended learners"
  | "Course landing page"
  | "Curriculum"
  | "Assessment rules"
  | "Survey"
type Diff = {
  section: DiffSection
  kind: "added" | "removed" | "changed"
  field: string
  detail: string
}

function diffSnapshots(
  prev: Record<string, unknown>,
  curr: Record<string, unknown>
): Diff[] {
  const out: Diff[] = []
  const trim = (s: string) => (s.length > 60 ? s.slice(0, 60) + "…" : s)
  const stripHtml = (s: unknown) =>
    typeof s === "string"
      ? s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : ""

  function changeScalar(section: DiffSection, label: string, p: unknown, c: unknown) {
    const ps = p == null ? "" : String(p)
    const cs = c == null ? "" : String(c)
    if (ps !== cs) {
      out.push({
        section,
        kind: "changed",
        field: label,
        detail:
          ps && cs
            ? `"${trim(ps)}" → "${trim(cs)}"`
            : ps
              ? `cleared (was "${trim(ps)}")`
              : `set to "${trim(cs)}"`,
      })
    }
  }

  function changeArray(
    section: DiffSection,
    label: string,
    p: unknown,
    c: unknown
  ) {
    const pa = (Array.isArray(p) ? p : []).map((x) => String(x))
    const ca = (Array.isArray(c) ? c : []).map((x) => String(x))
    const added = ca.filter((x) => !pa.includes(x))
    const removed = pa.filter((x) => !ca.includes(x))
    for (const a of added) {
      out.push({ section, kind: "added", field: `${label} added`, detail: `"${trim(a)}"` })
    }
    for (const r of removed) {
      out.push({ section, kind: "removed", field: `${label} removed`, detail: `"${trim(r)}"` })
    }
  }

  // ── Course landing page ─────────────────────────────────────
  changeScalar("Course landing page", "Title", prev.title, curr.title)
  changeScalar("Course landing page", "Subtitle", prev.subtitle, curr.subtitle)
  changeScalar("Course landing page", "Level", prev.level, curr.level)
  changeScalar("Course landing page", "Language", prev.language, curr.language)
  if (stripHtml(prev.description) !== stripHtml(curr.description)) {
    out.push({
      section: "Course landing page",
      kind: "changed",
      field: "Description",
      detail: "content updated",
    })
  }
  const prevPrice = `${prev.isFree ? "Free" : `$${prev.price ?? 0}`}`
  const currPrice = `${curr.isFree ? "Free" : `$${curr.price ?? 0}`}`
  if (prevPrice !== currPrice) {
    out.push({
      section: "Course landing page",
      kind: "changed",
      field: "Pricing",
      detail: `${prevPrice} → ${currPrice}`,
    })
  }
  if (String(prev.thumbnail ?? "") !== String(curr.thumbnail ?? "")) {
    out.push({
      section: "Course landing page",
      kind: "changed",
      field: "Thumbnail",
      detail: prev.thumbnail
        ? curr.thumbnail
          ? "image replaced"
          : "removed"
        : "added",
    })
  }

  // ── Intended learners ───────────────────────────────────────
  changeArray(
    "Intended learners",
    "Outcome",
    prev.learningOutcomes,
    curr.learningOutcomes
  )
  changeArray(
    "Intended learners",
    "Requirement",
    prev.requirements,
    curr.requirements
  )
  changeArray(
    "Intended learners",
    "Target audience",
    prev.targetAudience,
    curr.targetAudience
  )

  // ── Assessment rules ────────────────────────────────────────
  changeScalar(
    "Assessment rules",
    "Pass mark",
    prev.assessmentPassMark,
    curr.assessmentPassMark
  )
  changeScalar(
    "Assessment rules",
    "Retakes allowed",
    prev.retakesAllowed,
    curr.retakesAllowed
  )

  // ── Curriculum (sections + lectures) ────────────────────────
  type LectureLite = { id?: string; title?: string; type?: string; videoDuration?: number }
  type SectionLite = { id?: string; title?: string; lectures?: LectureLite[] }
  const prevSections = (prev.sections as SectionLite[] | undefined) ?? []
  const currSections = (curr.sections as SectionLite[] | undefined) ?? []
  const keyOf = (s: { id?: string; title?: string }) => s.id ?? s.title ?? ""
  const prevSectionMap = new Map(prevSections.map((s) => [keyOf(s), s]))
  const currSectionMap = new Map(currSections.map((s) => [keyOf(s), s]))

  for (const s of currSections) {
    if (!prevSectionMap.has(keyOf(s))) {
      out.push({
        section: "Curriculum",
        kind: "added",
        field: "Section added",
        detail: `"${s.title ?? "(untitled)"}" (${s.lectures?.length ?? 0} lectures)`,
      })
    }
  }
  for (const s of prevSections) {
    if (!currSectionMap.has(keyOf(s))) {
      out.push({
        section: "Curriculum",
        kind: "removed",
        field: "Section removed",
        detail: `"${s.title ?? "(untitled)"}"`,
      })
    }
  }
  // Lectures inside sections present in both.
  for (const cs of currSections) {
    const ps = prevSectionMap.get(keyOf(cs))
    if (!ps) continue
    if (cs.title !== ps.title) {
      out.push({
        section: "Curriculum",
        kind: "changed",
        field: "Section renamed",
        detail: `"${ps.title ?? ""}" → "${cs.title ?? ""}"`,
      })
    }
    const prevLectMap = new Map((ps.lectures ?? []).map((l) => [keyOf(l), l]))
    const currLectMap = new Map((cs.lectures ?? []).map((l) => [keyOf(l), l]))
    for (const l of cs.lectures ?? []) {
      if (!prevLectMap.has(keyOf(l))) {
        out.push({
          section: "Curriculum",
          kind: "added",
          field: "Lecture added",
          detail: `"${l.title ?? "(untitled)"}" in "${cs.title ?? ""}"`,
        })
      } else {
        const pl = prevLectMap.get(keyOf(l))!
        if (pl.title !== l.title) {
          out.push({
            section: "Curriculum",
            kind: "changed",
            field: "Lecture renamed",
            detail: `"${pl.title ?? ""}" → "${l.title ?? ""}"`,
          })
        }
        if (pl.type !== l.type) {
          out.push({
            section: "Curriculum",
            kind: "changed",
            field: "Lecture type",
            detail: `"${l.title ?? ""}" — ${pl.type ?? "?"} → ${l.type ?? "?"}`,
          })
        }
      }
    }
    for (const l of ps.lectures ?? []) {
      if (!currLectMap.has(keyOf(l))) {
        out.push({
          section: "Curriculum",
          kind: "removed",
          field: "Lecture removed",
          detail: `"${l.title ?? "(untitled)"}" from "${cs.title ?? ""}"`,
        })
      }
    }
  }

  // ── Survey ──────────────────────────────────────────────────
  type SurveyLite = {
    title?: string
    isMandatoryForCert?: boolean
    showRatingPublicly?: boolean
    questionsJson?: { questions?: Array<{ id?: string; prompt?: string; type?: string }> }
  }
  const ps = (prev.survey as SurveyLite | undefined) ?? {}
  const cs = (curr.survey as SurveyLite | undefined) ?? {}
  changeScalar("Survey", "Title", ps.title, cs.title)
  if (Boolean(ps.isMandatoryForCert) !== Boolean(cs.isMandatoryForCert)) {
    out.push({
      section: "Survey",
      kind: "changed",
      field: "Required for certificate",
      detail: cs.isMandatoryForCert ? "enabled" : "disabled",
    })
  }
  if (Boolean(ps.showRatingPublicly) !== Boolean(cs.showRatingPublicly)) {
    out.push({
      section: "Survey",
      kind: "changed",
      field: "Public rating display",
      detail: cs.showRatingPublicly ? "enabled" : "disabled",
    })
  }
  const pq = ps.questionsJson?.questions ?? []
  const cq = cs.questionsJson?.questions ?? []
  const pqMap = new Map(pq.map((q) => [q.id ?? q.prompt ?? "", q]))
  const cqMap = new Map(cq.map((q) => [q.id ?? q.prompt ?? "", q]))
  for (const q of cq) {
    const k = q.id ?? q.prompt ?? ""
    if (!pqMap.has(k)) {
      out.push({
        section: "Survey",
        kind: "added",
        field: "Question added",
        detail: `"${trim(q.prompt ?? "(untitled)")}"`,
      })
    } else {
      const prevQ = pqMap.get(k)!
      if (prevQ.prompt !== q.prompt) {
        out.push({
          section: "Survey",
          kind: "changed",
          field: "Question reworded",
          detail: `"${trim(prevQ.prompt ?? "")}" → "${trim(q.prompt ?? "")}"`,
        })
      }
    }
  }
  for (const q of pq) {
    const k = q.id ?? q.prompt ?? ""
    if (!cqMap.has(k)) {
      out.push({
        section: "Survey",
        kind: "removed",
        field: "Question removed",
        detail: `"${trim(q.prompt ?? "(untitled)")}"`,
      })
    }
  }

  return out
}

function SnapshotSummary({ snapshot }: { snapshot: unknown }) {
  const [showJson, setShowJson] = useState(false)
  const s = snapshot as Record<string, unknown> | null
  if (!s) return null

  const title = (s.title as string) ?? "(untitled)"
  const status = (s.status as string) ?? "—"
  const isFree = Boolean(s.isFree)
  const price = s.price ? String(s.price) : "0"
  const level = (s.level as string) ?? "—"
  const language = (s.language as string) ?? "—"
  const description = (s.description as string) ?? null
  const subtitle = (s.subtitle as string) ?? null

  // Curriculum summary if sections are included in the snapshot
  const sections = Array.isArray(s.sections) ? (s.sections as Array<{ lectures?: unknown[] }>) : []
  const lectureCount = sections.reduce(
    (sum, sec) => sum + (Array.isArray(sec.lectures) ? sec.lectures.length : 0),
    0
  )

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-lg border bg-background p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{title}</h4>
          <Badge variant={status === "PUBLISHED" ? "default" : "secondary"} className="text-xs">
            {status.replace("_", " ")}
          </Badge>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {description && (
          <p
            className="text-xs text-muted-foreground line-clamp-3"
            dangerouslySetInnerHTML={{ __html: description }}
          />
        )}
        <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
          <div>
            <span className="text-muted-foreground">Pricing:</span>{" "}
            <span className="font-medium">{isFree ? "Free" : `$${price}`}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Level:</span>{" "}
            <span className="font-medium">{level}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Language:</span>{" "}
            <span className="font-medium">{language}</span>
          </div>
          {sections.length > 0 && (
            <div>
              <span className="text-muted-foreground">Curriculum:</span>{" "}
              <span className="font-medium">
                {sections.length} section{sections.length === 1 ? "" : "s"} · {lectureCount} lecture
                {lectureCount === 1 ? "" : "s"}
              </span>
            </div>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setShowJson((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        {showJson ? "Hide raw JSON" : "Show raw JSON"}
      </button>
      {showJson && (
        <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto max-h-72">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      )}
    </div>
  )
}
