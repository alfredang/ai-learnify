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
  const [loading, setLoading] = useState(false)

  async function loadSnapshot() {
    if (snapshot || loading) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/courses/${courseId}/versions/${version.versionNumber}`
      )
      if (res.ok) {
        const json = await res.json()
        setSnapshot(json.version?.snapshotJson ?? null)
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
        <div className="mt-3 pl-7">
          {loading ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading snapshot...
            </div>
          ) : snapshot ? (
            <pre className="text-xs bg-muted/40 rounded p-3 overflow-x-auto max-h-72">
              {JSON.stringify(snapshot, null, 2)}
            </pre>
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
