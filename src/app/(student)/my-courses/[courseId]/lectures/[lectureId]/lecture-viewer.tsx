"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { VideoPlayer } from "@/components/courses/video-player"
import { LectureSidebar } from "@/components/courses/lecture-sidebar"
import { QuizPlayer } from "@/components/courses/quiz-player"
import { PdfViewer } from "@/components/courses/pdf-viewer"
import { SlidePlayer, type VoiceOverSlidesPayload } from "@/components/courses/slide-player"
import { ScormPlayer, type ScormPayload } from "@/components/courses/scorm-player"
import { DownloadableViewer, type DownloadablePayload } from "@/components/courses/downloadable-viewer"
import { HtmlPlayer, type HtmlPayload } from "@/components/courses/html-player"
import { toast } from "sonner"
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Circle,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  ArrowLeft,
  ListVideo,
  Play,
  X,
} from "lucide-react"
import type { Section, Lecture } from "@prisma/client"

interface LectureViewerProps {
  courseId: string
  courseTitle: string
  courseProgress: number
  lecture: Lecture
  sections: (Section & { lectures: Lecture[] })[]
  lectureProgress: Record<string, { isCompleted: boolean; lastPosition: number }>
  prevLecture: { id: string; title: string } | null
  nextLecture: { id: string; title: string } | null
}

export function LectureViewer({
  courseId,
  courseTitle,
  courseProgress: initialCourseProgress,
  lecture,
  sections,
  lectureProgress: initialProgress,
  prevLecture,
  nextLecture,
}: LectureViewerProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoPlay = searchParams.get("autoplay") === "1"
  // Desktop: docked contents panel (open by default).
  // Mobile: contents live in a bottom sheet that starts closed so the video is visible.
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Auto-advance countdown shown when a video ends.
  const [upNextIn, setUpNextIn] = useState<number | null>(null)
  const [lectureProgress, setLectureProgress] = useState(initialProgress)
  const [courseProgress, setCourseProgress] = useState(initialCourseProgress)
  const savingRef = useRef(false)

  const isCompleted = lectureProgress[lecture.id]?.isCompleted ?? false

  // Phase 6 — derive type-specific payloads from the polymorphic
  // `contentPayloadJson` (or fall back to `content` when an author has
  // stashed just a URL there for the simpler types).
  const rawPayload = (lecture as unknown as { contentPayloadJson?: unknown })
    .contentPayloadJson
  const payload =
    rawPayload && typeof rawPayload === "object" && rawPayload !== null
      ? (rawPayload as Record<string, unknown>)
      : null

  const pdfUrl =
    (payload?.pdfUrl as string | undefined) ??
    (lecture.type === "PDF" ? (lecture.content ?? undefined) : undefined)

  const voSlidesPayload: VoiceOverSlidesPayload | null =
    lecture.type === "VOICE_OVER_SLIDES" &&
    typeof payload?.pdfUrl === "string"
      ? {
          pdfUrl: payload.pdfUrl as string,
          slides: Array.isArray(payload.slides)
            ? (payload.slides as VoiceOverSlidesPayload["slides"])
            : [],
        }
      : null

  const scormPayload: ScormPayload | null =
    lecture.type === "SCORM" && typeof payload?.packageUrl === "string"
      ? {
          packageUrl: payload.packageUrl as string,
          entryPoint:
            typeof payload.entryPoint === "string"
              ? (payload.entryPoint as string)
              : undefined,
          version:
            payload.version === "SCORM_2004" ? "SCORM_2004" : "SCORM_1_2",
        }
      : null

  const xapiPayload: { launchUrl: string } | null =
    lecture.type === "XAPI" && typeof payload?.launchUrl === "string"
      ? { launchUrl: payload.launchUrl as string }
      : null

  const downloadablePayload: DownloadablePayload | null =
    lecture.type === "DOWNLOADABLE" && Array.isArray(payload?.files)
      ? { files: payload!.files as DownloadablePayload["files"] }
      : null

  const htmlPayload: HtmlPayload | null =
    lecture.type === "HTML" && typeof payload?.html === "string"
      ? { html: payload.html as string }
      : null

  const saveProgress = useCallback(
    async (data: {
      isCompleted?: boolean
      watchedDuration?: number
      lastPosition?: number
    }) => {
      if (savingRef.current) return
      savingRef.current = true

      try {
        const res = await fetch(`/api/lectures/${lecture.id}/progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        // Surface explicit completion failures to the learner. Silent
        // fail is only OK for high-frequency timeUpdate noise.
        if (!res.ok && data.isCompleted !== undefined) {
          const text = await res.text()
          let msg = `Couldn't save progress (${res.status}).`
          try {
            const parsed = JSON.parse(text)
            if (parsed?.error) msg = parsed.error
          } catch {
            // body wasn't JSON — fall back to status-based copy
          }
          toast.error(msg)
        }

        if (res.ok) {
          const result = await res.json()

          if (data.isCompleted !== undefined) {
            setLectureProgress((prev) => ({
              ...prev,
              [lecture.id]: {
                isCompleted: data.isCompleted!,
                lastPosition: data.lastPosition ?? prev[lecture.id]?.lastPosition ?? 0,
              },
            }))
          }

          if (result.courseProgress !== undefined) {
            setCourseProgress(result.courseProgress)
          }

          if (result.courseCompleted) {
            toast.success("Congratulations! You've completed this course!", {
              description: result.certificateGenerated
                ? "Your certificate is ready to view."
                : undefined,
              action: result.certificateGenerated
                ? { label: "View Certificate", onClick: () => router.push("/certificates") }
                : undefined,
              duration: 8000,
            })
          }
        }
      } catch {
        // Silent fail for background saves
      } finally {
        savingRef.current = false
      }
    },
    [lecture.id]
  )

  const handleTimeUpdate = useCallback(
    (currentTime: number) => {
      saveProgress({
        watchedDuration: Math.floor(currentTime),
        lastPosition: Math.floor(currentTime),
      })
    },
    [saveProgress]
  )

  const handleVideoEnded = useCallback(() => {
    if (!isCompleted) {
      saveProgress({ isCompleted: true, lastPosition: 0 })
    }
    if (nextLecture) {
      setUpNextIn(5)
    } else if (!isCompleted) {
      toast.success("Lecture completed!")
    }
  }, [isCompleted, saveProgress, nextLecture])

  const toggleComplete = useCallback(async () => {
    const newValue = !isCompleted
    await saveProgress({ isCompleted: newValue })
    toast.success(newValue ? "Marked as complete" : "Marked as incomplete")
  }, [isCompleted, saveProgress])

  const navigateToLecture = useCallback(
    (lectureId: string, opts?: { autoplay?: boolean }) => {
      router.push(`/my-courses/${courseId}/lectures/${lectureId}${opts?.autoplay ? "?autoplay=1" : ""}`)
    },
    [router, courseId]
  )

  // Count down, then play the next lecture.
  useEffect(() => {
    if (upNextIn === null || !nextLecture) return
    if (upNextIn <= 0) {
      navigateToLecture(nextLecture.id, { autoplay: true })
      return
    }
    const t = setTimeout(() => setUpNextIn((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [upNextIn, nextLecture, navigateToLecture])

  // Position of this lecture for the "Lecture 3 of 12" label.
  const flatLectures = sections.flatMap((sec) => sec.lectures.map((l) => ({ id: l.id, sectionTitle: sec.title })))
  const lectureIndex = flatLectures.findIndex((l) => l.id === lecture.id)
  const sectionTitle = flatLectures[lectureIndex]?.sectionTitle

  const sidebarProps = {
    courseId,
    courseTitle,
    currentLectureId: lecture.id,
    courseProgress,
    sections,
    lectureProgress,
  }

  return (
    <div className="flex h-[calc(100dvh-64px)]">
      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-2 border-b bg-background px-2 py-2 sm:px-4">
          <Button variant="ghost" size="sm" asChild className="shrink-0">
            <Link href={`/my-courses/${courseId}`} aria-label="Back to course overview">
              <ArrowLeft className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Course overview</span>
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{courseTitle}</p>
            <div className="flex items-center gap-2">
              <Progress value={courseProgress} className="h-1 max-w-[220px] flex-1" aria-label="Course progress" />
              <span className="text-xs tabular-nums text-muted-foreground">{courseProgress}%</span>
            </div>
          </div>
          {/* Mobile / tablet: open contents sheet */}
          <Button variant="outline" size="sm" onClick={() => setSheetOpen(true)} className="shrink-0 lg:hidden">
            <ListVideo className="h-4 w-4 mr-1.5" />
            Contents
          </Button>
          {/* Desktop: dock / undock contents */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden shrink-0 lg:inline-flex"
            aria-label={sidebarOpen ? "Hide course content" : "Show course content"}
          >
            {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </Button>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {/* Video / Text / Quiz content */}
          {lecture.type === "VIDEO" && lecture.videoUrl ? (
            <div className="relative bg-black">
              <VideoPlayer
                key={lecture.id}
                videoUrl={lecture.videoUrl}
                autoPlay={autoPlay}
                lastPosition={lectureProgress[lecture.id]?.lastPosition ?? 0}
                onTimeUpdate={handleTimeUpdate}
                onEnded={handleVideoEnded}
                className="max-w-6xl"
              />
              {upNextIn !== null && nextLecture && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-4 text-white" role="dialog" aria-label="Up next">
                  <div className="w-full max-w-sm text-center space-y-4">
                    <p className="text-xs uppercase tracking-widest text-white/70">Up next in {upNextIn}s</p>
                    <p className="text-lg font-semibold leading-snug">{nextLecture.title}</p>
                    <div className="flex justify-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => navigateToLecture(nextLecture.id, { autoplay: true })}
                      >
                        <Play className="h-4 w-4 mr-1.5 fill-current" /> Play now
                      </Button>
                      <Button
                        variant="ghost"
                        className="text-white hover:bg-white/10 hover:text-white"
                        onClick={() => setUpNextIn(null)}
                      >
                        <X className="h-4 w-4 mr-1.5" /> Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : lecture.type === "TEXT" ? (
            <div className="p-6 max-w-3xl mx-auto">
              <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                <FileText className="h-5 w-5" />
                <span className="text-sm">Text Lecture</span>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
                {lecture.content || "No content available for this lecture."}
              </div>
            </div>
          ) : lecture.type === "QUIZ" ? (
            <QuizPlayer
              content={lecture.content}
              lectureId={lecture.id}
              onComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Quiz completed!")
                }
              }}
              onCertificateIssued={(cert) => {
                toast.success("Certificate earned!", {
                  description: `Reference ${cert.certificateId}`,
                })
              }}
            />
          ) : lecture.type === "PDF" && pdfUrl ? (
            <PdfViewer
              pdfUrl={pdfUrl}
              title={lecture.title}
              alreadyCompleted={isCompleted}
              onMarkComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Lecture complete")
                }
              }}
            />
          ) : lecture.type === "VOICE_OVER_SLIDES" && voSlidesPayload ? (
            <SlidePlayer
              payload={voSlidesPayload}
              title={lecture.title}
              alreadyCompleted={isCompleted}
              onAllSlidesVisited={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("All slides reviewed")
                }
              }}
            />
          ) : lecture.type === "SCORM" && scormPayload ? (
            <ScormPlayer
              payload={scormPayload}
              title={lecture.title}
              lectureId={lecture.id}
              alreadyCompleted={isCompleted}
              onMarkComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Lecture complete")
                }
              }}
            />
          ) : lecture.type === "XAPI" && xapiPayload ? (
            <ScormPlayer
              payload={{ packageUrl: xapiPayload.launchUrl }}
              title={lecture.title}
              lectureId={lecture.id}
              alreadyCompleted={isCompleted}
              onMarkComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Lecture complete")
                }
              }}
            />
          ) : lecture.type === "DOWNLOADABLE" && downloadablePayload ? (
            <DownloadableViewer
              payload={downloadablePayload}
              title={lecture.title}
              description={lecture.description}
              alreadyCompleted={isCompleted}
              onMarkComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Lecture complete")
                }
              }}
            />
          ) : lecture.type === "HTML" && htmlPayload ? (
            <HtmlPlayer
              payload={htmlPayload}
              title={lecture.title}
              alreadyCompleted={isCompleted}
              onMarkComplete={() => {
                if (!isCompleted) {
                  saveProgress({ isCompleted: true })
                  toast.success("Lecture complete")
                }
              }}
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              No content available for this lecture.
            </div>
          )}

          {/* Lecture info + controls */}
          <div className="border-b px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-4xl">
              <p className="text-xs text-muted-foreground">
                Lecture {lectureIndex + 1} of {flatLectures.length}
                {sectionTitle ? ` · ${sectionTitle}` : ""}
              </p>
              <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <h1 className="text-xl font-bold leading-snug">{lecture.title}</h1>
                <Button
                  variant={isCompleted ? "secondary" : "outline"}
                  size="sm"
                  onClick={toggleComplete}
                  className="hidden shrink-0 lg:inline-flex"
                >
                  {isCompleted ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1.5 text-emerald-600" />
                      Completed
                    </>
                  ) : (
                    <>
                      <Circle className="h-4 w-4 mr-1.5" />
                      Mark as complete
                    </>
                  )}
                </Button>
              </div>

              {lecture.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {lecture.description}
                </p>
              )}

              {/* Desktop prev / next */}
              <div className="mt-6 hidden items-center justify-between gap-4 border-t pt-5 lg:flex">
                {prevLecture ? (
                  <Button variant="outline" onClick={() => navigateToLecture(prevLecture.id)} className="max-w-[45%]">
                    <ChevronLeft className="h-4 w-4 mr-1 shrink-0" />
                    <span className="truncate">{prevLecture.title}</span>
                  </Button>
                ) : (
                  <div />
                )}
                {nextLecture ? (
                  <Button onClick={() => navigateToLecture(nextLecture.id)} className="max-w-[45%]">
                    <span className="truncate">Next: {nextLecture.title}</span>
                    <ChevronRight className="h-4 w-4 ml-1 shrink-0" />
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href={`/my-courses/${courseId}`}>Finish · back to course</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile bottom navigation */}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="grid grid-cols-3 items-center gap-2 px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!prevLecture}
              onClick={() => prevLecture && navigateToLecture(prevLecture.id)}
              className="justify-start"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </Button>
            <Button variant={isCompleted ? "secondary" : "outline"} size="sm" onClick={toggleComplete}>
              {isCompleted ? (
                <><CheckCircle className="h-4 w-4 mr-1 text-emerald-600" /> Done</>
              ) : (
                <><Circle className="h-4 w-4 mr-1" /> Complete</>
              )}
            </Button>
            {nextLecture ? (
              <Button size="sm" onClick={() => navigateToLecture(nextLecture.id)} className="justify-self-end">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button size="sm" asChild className="justify-self-end">
                <Link href={`/my-courses/${courseId}`}>Finish</Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop docked contents */}
      {sidebarOpen && (
        <aside className="hidden w-80 shrink-0 border-l lg:block xl:w-96" aria-label="Course content">
          <LectureSidebar {...sidebarProps} />
        </aside>
      )}

      {/* Mobile / tablet contents sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[88vw] max-w-sm gap-0 p-0">
          <SheetTitle className="sr-only">Course content</SheetTitle>
          <LectureSidebar {...sidebarProps} onNavigate={() => setSheetOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  )
}
