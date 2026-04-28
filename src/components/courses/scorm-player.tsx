"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, BookOpen, CheckCircle2 } from "lucide-react"

export type ScormVersion = "SCORM_1_2" | "SCORM_2004"

export type ScormPayload = {
  packageUrl: string
  entryPoint?: string
  version?: ScormVersion
}

interface Props {
  payload: ScormPayload
  title?: string
  lectureId?: string
  alreadyCompleted?: boolean
  onMarkComplete?: () => void
}

// Use unknown for the API instance — scorm-again's types are large and we
// only need it as an opaque handle that we attach to window and tear down.
type ScormApiInstance = {
  loadFromFlattenedJSON: (json: Record<string, unknown>, prefix?: string) => void
  loadFromJSON: (json: Record<string, unknown>, prefix?: string) => void
  terminate: () => string
  on: (event: string, callback: (...args: unknown[]) => void) => void
  reset?: (settings?: unknown) => void
}

declare global {
  interface Window {
    API?: ScormApiInstance
    API_1484_11?: ScormApiInstance
  }
}

/**
 * SCORM 1.2 / 2004 player with full CMI runtime via scorm-again.
 *
 * Lifecycle:
 *   1. Fetch any prior CMI snapshot from /api/lectures/[id]/scorm-cmi
 *   2. Construct Scorm12API or Scorm2004API and attach to window.API /
 *      window.API_1484_11 BEFORE the iframe loads (the SCO's findAPI()
 *      walks parent chain expecting one of those globals).
 *   3. loadFromFlattenedJSON(prior) so the SCO resumes where it stopped.
 *   4. scorm-again autocommits to `lmsCommitUrl` (our endpoint).
 *   5. The endpoint inspects lesson_status / completion_status / success_status
 *      and flips LectureProgress.isCompleted when the SCO reports
 *      passed / completed — no manual button required.
 */
export function ScormPlayer({
  payload,
  title,
  lectureId,
  alreadyCompleted,
  onMarkComplete,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const apiRef = useRef<ScormApiInstance | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [runtimeReady, setRuntimeReady] = useState(false)
  const [completedFromScorm, setCompletedFromScorm] = useState(false)
  const version: ScormVersion = payload.version ?? "SCORM_1_2"

  useEffect(() => {
    if (!lectureId) {
      setBootstrapping(false)
      return
    }
    let cancelled = false
    let api: ScormApiInstance | null = null

    async function setup() {
      // 1. Restore prior CMI snapshot (if any).
      let prior: Record<string, unknown> | null = null
      try {
        const res = await fetch(`/api/lectures/${lectureId}/scorm-cmi`)
        if (res.ok) {
          const json = await res.json()
          if (json.cmiData && typeof json.cmiData === "object") {
            prior = json.cmiData as Record<string, unknown>
          }
        }
      } catch {
        // Resume is best-effort; SCO will start fresh if it fails.
      }
      if (cancelled) return

      // 2. Construct the API instance for the requested version.
      const settings = {
        autocommit: true,
        autocommitSeconds: 30,
        lmsCommitUrl: `/api/lectures/${lectureId}/scorm-cmi`,
        dataCommitFormat: "flattened",
        commitRequestDataType: "application/json;charset=UTF-8",
      }

      try {
        if (version === "SCORM_2004") {
          const mod = await import("scorm-again/scorm2004")
          const Ctor = mod.default
          api = new Ctor(settings) as unknown as ScormApiInstance
          window.API_1484_11 = api
        } else {
          const mod = await import("scorm-again/scorm12")
          const Ctor = mod.default
          api = new Ctor(settings) as unknown as ScormApiInstance
          window.API = api
        }
      } catch (e) {
        console.error("[scorm-player] failed to construct API", e)
        return
      }

      // 3. Hydrate prior CMI state.
      if (prior && api) {
        try {
          api.loadFromFlattenedJSON(prior)
        } catch (err) {
          console.warn("[scorm-player] failed to restore CMI", err)
        }
      }

      // 4. Listen for the SCO marking itself complete and propagate up.
      try {
        api?.on("LMSSetValue.cmi.core.lesson_status", (...args: unknown[]) => {
          const value = args[args.length - 1]
          if (typeof value === "string" && /^(passed|completed)$/i.test(value)) {
            setCompletedFromScorm(true)
            onMarkComplete?.()
          }
        })
        api?.on("SetValue.cmi.completion_status", (...args: unknown[]) => {
          const value = args[args.length - 1]
          if (typeof value === "string" && /^completed$/i.test(value)) {
            setCompletedFromScorm(true)
            onMarkComplete?.()
          }
        })
        api?.on("SetValue.cmi.success_status", (...args: unknown[]) => {
          const value = args[args.length - 1]
          if (typeof value === "string" && /^passed$/i.test(value)) {
            setCompletedFromScorm(true)
            onMarkComplete?.()
          }
        })
      } catch {
        // event handler attachment is best-effort; commit endpoint also
        // detects completion server-side.
      }

      apiRef.current = api
      setRuntimeReady(true)
      setBootstrapping(false)
    }

    setup()

    return () => {
      cancelled = true
      // Tell the SCO we're leaving (forces a final commit) and detach
      // from window so the next lecture starts clean.
      try {
        apiRef.current?.terminate()
      } catch {
        // ignore — Terminate may have already been called by the SCO.
      }
      if (window.API === apiRef.current) delete window.API
      if (window.API_1484_11 === apiRef.current) delete window.API_1484_11
      apiRef.current = null
    }
  }, [lectureId, version, onMarkComplete])

  const launchUrl = payload.entryPoint
    ? new URL(payload.entryPoint, payload.packageUrl).toString()
    : payload.packageUrl

  const showCompletedBadge = alreadyCompleted || completedFromScorm

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BookOpen className="h-5 w-5" />
          <span className="text-sm">{title ?? "SCORM package"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {version === "SCORM_2004" ? "SCORM 2004" : "SCORM 1.2"}
          </Badge>
          {bootstrapping && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Initialising
            </Badge>
          )}
          {runtimeReady && !bootstrapping && (
            <Badge variant="outline" className="border-emerald-200 text-emerald-700">
              Runtime ready
            </Badge>
          )}
          {showCompletedBadge && (
            <Badge className="bg-emerald-600">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
            </Badge>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="relative bg-black/5" style={{ height: "70vh" }}>
          {bootstrapping ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Connecting SCORM runtime...
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={launchUrl}
              title={title ?? "SCORM content"}
              className="absolute inset-0 h-full w-full"
              // allow-same-origin lets the SCO read the LMS API on the
              // parent window (required for SCORM tracking).
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onLoad={() => setIframeLoaded(true)}
            />
          )}
        </div>
      </Card>

      <Card>
        <CardContent className="p-3 text-xs flex items-start gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">SCORM tracking is active.</span>{" "}
            Your progress, score, and bookmark are saved automatically every 30 seconds and on exit. The lecture marks complete as soon as the package reports{" "}
            <code className="bg-muted px-1 rounded">passed</code> or{" "}
            <code className="bg-muted px-1 rounded">completed</code>.
          </div>
        </CardContent>
      </Card>

      {onMarkComplete && !showCompletedBadge && iframeLoaded && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onMarkComplete}>
            Mark complete manually
          </Button>
        </div>
      )}
    </div>
  )
}
