"use client"

import { useState } from "react"
import Link from "next/link"
import { Play } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CourseThumbnail } from "@/components/courses/course-thumbnail"

interface CoursePreviewProps {
  title: string
  thumbnail: string | null
  /** Public preview video (course trailer or a free-preview lecture). */
  previewSrc: string | null
  previewLabel?: string
  /** For enrolled learners the image becomes a shortcut into the course. */
  startHref?: string | null
}

/**
 * Course hero media. Shows the thumbnail with a play affordance:
 *  - a preview video opens in a dialog (no sign-in needed),
 *  - otherwise enrolled learners jump straight into their next lecture.
 */
export function CoursePreview({ title, thumbnail, previewSrc, previewLabel, startHref }: CoursePreviewProps) {
  const [open, setOpen] = useState(false)

  const overlay = (label: string) => (
    <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/35 transition-colors group-hover:bg-black/45">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg transition-transform group-hover:scale-105">
        <Play className="h-7 w-7 translate-x-0.5 fill-neutral-900 text-neutral-900" aria-hidden="true" />
      </span>
      <span className="rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">{label}</span>
    </span>
  )

  if (previewSrc) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Play preview of ${title}`}
        >
          <CourseThumbnail src={thumbnail} title={title} priority sizes="(max-width: 1024px) 100vw, 400px" />
          {overlay(previewLabel ?? "Preview this course")}
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-3xl gap-3 p-3 sm:p-4">
            <DialogHeader className="px-1">
              <DialogTitle className="text-base leading-snug">
                <span className="text-muted-foreground font-normal">Course preview · </span>
                {title}
              </DialogTitle>
            </DialogHeader>
            {open && (
              <video
                src={previewSrc}
                className="aspect-video w-full rounded-md bg-black"
                controls
                autoPlay
                playsInline
                controlsList="nodownload"
              />
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  if (startHref) {
    return (
      <Link
        href={startHref}
        className="group relative block aspect-video w-full overflow-hidden rounded-lg bg-neutral-900"
        aria-label={`Open ${title}`}
      >
        <CourseThumbnail src={thumbnail} title={title} priority sizes="(max-width: 1024px) 100vw, 400px" />
        {overlay("Go to your next lecture")}
      </Link>
    )
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-neutral-900">
      <CourseThumbnail src={thumbnail} title={title} priority sizes="(max-width: 1024px) 100vw, 400px" />
    </div>
  )
}
