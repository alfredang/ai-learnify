"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  CheckCircle2,
  FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type SlideData = {
  page: number
  voText?: string | null
}

export type VoiceOverSlidesPayload = {
  pdfUrl: string
  slides?: SlideData[]
}

interface Props {
  payload: VoiceOverSlidesPayload
  title?: string
  alreadyCompleted?: boolean
  onAllSlidesVisited?: () => void
}

/**
 * Phase 6 — Spec §7.5: PPT/PDF with voice-over text, slide-by-slide.
 *
 * Input contract: a PDF already hosted in storage + per-page voice-over
 * text authored alongside. We render the PDF inline by page anchor
 * (`#page=N`) and sync the voice-over sidebar to the current slide. The
 * lecture is considered complete once the learner visits every slide —
 * spec §7.5 "Counts toward content completion".
 *
 * Voice synthesis uses the browser's SpeechSynthesis API — no audio
 * needs to be recorded or uploaded, matching the spec's "no audio
 * required" note.
 */
export function SlidePlayer({
  payload,
  title,
  alreadyCompleted,
  onAllSlidesVisited,
}: Props) {
  const slides = useMemo<SlideData[]>(() => {
    const provided = payload.slides ?? []
    if (provided.length > 0) return provided.slice().sort((a, b) => a.page - b.page)
    // If the author didn't specify per-slide text, fall back to a single
    // "slide 1" entry — keeps the player usable as a plain PDF viewer.
    return [{ page: 1, voText: null }]
  }, [payload.slides])

  const [currentIdx, setCurrentIdx] = useState(0)
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]))
  const [speaking, setSpeaking] = useState(false)

  const current = slides[currentIdx]
  const allVisited = visited.size === slides.length

  function markVisited(idx: number) {
    setVisited((prev) => {
      if (prev.has(idx)) return prev
      const next = new Set(prev)
      next.add(idx)
      if (next.size === slides.length && onAllSlidesVisited && !alreadyCompleted) {
        // Defer to next tick so React can finish the state update before the
        // callback fires a progress POST.
        setTimeout(() => onAllSlidesVisited(), 0)
      }
      return next
    })
  }

  function go(idx: number) {
    const clamped = Math.max(0, Math.min(slides.length - 1, idx))
    setCurrentIdx(clamped)
    markVisited(clamped)
    stopSpeaking()
  }

  function toggleSpeak() {
    if (typeof window === "undefined") return
    if (!("speechSynthesis" in window)) return
    if (speaking) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
      return
    }
    const text = current?.voText
    if (!text) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    setSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    if (typeof window === "undefined") return
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
    }
    setSpeaking(false)
  }

  const pdfSrc = `${payload.pdfUrl}#page=${current.page}&toolbar=0&view=FitH`

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="h-5 w-5" />
          <span className="text-sm">{title ?? "Voice-over slides"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Slide {currentIdx + 1} / {slides.length}
          </Badge>
          <Badge variant={allVisited ? "default" : "outline"}>
            {visited.size} visited
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="relative bg-muted/30" style={{ height: "60vh" }}>
            <iframe
              key={current.page}
              src={pdfSrc}
              title={`Slide ${current.page}`}
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3 h-full flex flex-col">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Voice-over
              </span>
              {current.voText && (
                <Button size="sm" variant="ghost" onClick={toggleSpeak}>
                  {speaking ? (
                    <>
                      <VolumeX className="h-3.5 w-3.5 mr-1" /> Stop
                    </>
                  ) : (
                    <>
                      <Volume2 className="h-3.5 w-3.5 mr-1" /> Read aloud
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap">
              {current.voText ? (
                current.voText
              ) : (
                <span className="text-muted-foreground">
                  No voice-over text for this slide.
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => go(currentIdx - 1)}
          disabled={currentIdx === 0}
        >
          <ChevronLeft className="h-4 w-4 mr-1" /> Previous
        </Button>

        <div className="flex items-center gap-1 overflow-x-auto max-w-[40vw]">
          {slides.map((s, idx) => (
            <button
              key={s.page}
              type="button"
              onClick={() => go(idx)}
              className={cn(
                "h-8 min-w-8 px-2 rounded text-xs font-mono border",
                idx === currentIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : visited.has(idx)
                  ? "bg-muted"
                  : "bg-background"
              )}
              aria-label={`Go to slide ${idx + 1}`}
            >
              {idx + 1}
            </button>
          ))}
        </div>

        <Button
          onClick={() => go(currentIdx + 1)}
          disabled={currentIdx === slides.length - 1}
        >
          Next <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>

      {allVisited && (
        <div className="flex items-center justify-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="h-4 w-4" /> All slides visited — progress
          saved.
        </div>
      )}
    </div>
  )
}
