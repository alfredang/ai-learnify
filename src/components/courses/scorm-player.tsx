"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, BookOpen, CheckCircle2 } from "lucide-react"

export type ScormPayload = {
  packageUrl: string       // entrypoint or imsmanifest URL
  entryPoint?: string      // optional launch file override
}

interface Props {
  payload: ScormPayload
  title?: string
  lectureId?: string
  alreadyCompleted?: boolean
  onMarkComplete?: () => void
}

/**
 * Phase 6 — Spec §7.1 SCORM 1.2 / 2004 lecture type.
 *
 * SCOPE NOTE: This player hosts a SCORM package inside a sandboxed iframe
 * and surfaces a manual "mark complete" affordance so the learner can
 * progress. A proper SCORM runtime (window.API for 1.2 / window.API_1484_11
 * for 2004) + CMI persistence back to `LectureProgress.contentPayloadJson`
 * is not implemented here — that requires either:
 *   (a) depending on `scorm-again` and wiring its callbacks to a
 *       `/api/lectures/[lectureId]/scorm-cmi` endpoint, or
 *   (b) using an external SCORM cloud (Rustici etc.) behind an iframe URL.
 *
 * For packages uploaded as a `.zip`, the author must pre-extract them and
 * host the unpacked entry point as `payload.packageUrl`. Automated server-
 * side unpack is also a follow-up (`jszip` + S3/Cloudinary raw is the
 * straightforward path).
 */
export function ScormPlayer({
  payload,
  title,
  lectureId,
  alreadyCompleted,
  onMarkComplete,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Stub placeholder: if we later add `window.API` injection this is
    // where we'd attach the parent-frame shim before the iframe loads.
    // Intentionally empty for now.
  }, [lectureId])

  const launchUrl = payload.entryPoint
    ? new URL(payload.entryPoint, payload.packageUrl).toString()
    : payload.packageUrl

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground">
          <BookOpen className="h-5 w-5" />
          <span className="text-sm">{title ?? "SCORM package"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">SCORM</Badge>
          {loaded && <Badge variant="outline">Loaded</Badge>}
        </div>
      </div>

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="p-3 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <b>SCORM runtime note:</b> this player launches the package in a
            sandboxed iframe but does not yet intercept the SCORM API (cmi
            tracking). Mark the lecture complete manually until the runtime
            integration ships.
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="relative bg-black/5" style={{ height: "70vh" }}>
          <iframe
            ref={iframeRef}
            src={launchUrl}
            title={title ?? "SCORM content"}
            className="absolute inset-0 h-full w-full"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </Card>

      {onMarkComplete && (
        <div className="flex justify-end">
          <Button
            onClick={onMarkComplete}
            disabled={alreadyCompleted}
            variant={alreadyCompleted ? "outline" : "default"}
          >
            {alreadyCompleted ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Marked complete
              </>
            ) : (
              "Mark lecture complete"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
