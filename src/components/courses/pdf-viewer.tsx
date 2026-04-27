"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, FileText, ExternalLink, Download } from "lucide-react"

interface Props {
  pdfUrl: string
  title?: string
  alreadyCompleted?: boolean
  onMarkComplete?: () => void
}

/**
 * Phase 6 — Spec §7.1 PDF lecture type.
 *
 * Uses the browser's native PDF viewer via `<iframe>` — no client-side PDF
 * library required, which keeps the bundle small. The learner marks the
 * lecture complete manually (or the parent can auto-mark after a dwell
 * timer). For strict "scroll-to-end" gating we'd need pdf.js; we defer
 * that until there's a compliance requirement.
 */
export function PdfViewer({
  pdfUrl,
  title,
  alreadyCompleted,
  onMarkComplete,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [loadError, setLoadError] = useState(false)

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-sm">{title ?? "PDF lecture"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} download>
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </a>
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="relative bg-muted/30" style={{ height: "75vh" }}>
          {loadError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 text-sm text-muted-foreground">
              <p>This PDF couldn't be embedded.</p>
              <p className="mt-1">
                Use the <b>Open</b> or <b>Download</b> button above to view it.
              </p>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              src={pdfUrl}
              title={title ?? "PDF"}
              className="absolute inset-0 h-full w-full"
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      </Card>

      {onMarkComplete && (
        <CardContent className="p-0 flex justify-end">
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
        </CardContent>
      )}
    </div>
  )
}
