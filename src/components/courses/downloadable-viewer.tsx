"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  CheckCircle2,
  Download,
  FileArchive,
  ExternalLink,
} from "lucide-react"

export type DownloadableFile = {
  name: string
  url: string
  sizeBytes?: number
}

export type DownloadablePayload = {
  files: DownloadableFile[]
}

interface Props {
  payload: DownloadablePayload
  title?: string
  description?: string | null
  alreadyCompleted?: boolean
  onMarkComplete?: () => void
}

function humanSize(bytes?: number) {
  if (!bytes) return null
  const units = ["B", "KB", "MB", "GB"]
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/**
 * Phase 6 — Spec §7.1 Downloadable lecture type. A list of files the
 * learner can grab (PDFs, ZIPs, code samples, templates, etc.) plus a
 * manual completion button since there's no playback signal to observe.
 */
export function DownloadableViewer({
  payload,
  title,
  description,
  alreadyCompleted,
  onMarkComplete,
}: Props) {
  const files = payload.files ?? []

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <FileArchive className="h-5 w-5" />
        <span className="text-sm">{title ?? "Downloads"}</span>
      </div>

      {description && (
        <p className="text-sm text-muted-foreground">{description}</p>
      )}

      <Card>
        <CardContent className="p-0">
          {files.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No files attached.
            </div>
          ) : (
            <ul className="divide-y">
              {files.map((f, idx) => {
                const size = humanSize(f.sizeBytes)
                return (
                  <li
                    key={`${f.url}-${idx}`}
                    className="flex items-center gap-3 p-3"
                  >
                    <FileArchive className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {f.name}
                      </div>
                      {size && (
                        <div className="text-xs text-muted-foreground">
                          {size}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={f.url} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={f.url} download>
                        <Download className="h-3.5 w-3.5 mr-1" /> Download
                      </a>
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
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
