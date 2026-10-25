"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { formatClock, LECTURE_TYPE_LABEL } from "@/lib/course-format"
import { Progress } from "@/components/ui/progress"
import {
  Play,
  FileText,
  HelpCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  Presentation,
  Download,
  Boxes,
} from "lucide-react"
import type { Section, Lecture } from "@prisma/client"

interface LectureSidebarProps {
  courseId: string
  courseTitle: string
  currentLectureId: string
  courseProgress: number
  sections: (Section & { lectures: Lecture[] })[]
  lectureProgress: Record<string, { isCompleted: boolean; lastPosition: number }>
  /** Called after a lecture link is clicked (used to close the mobile sheet). */
  onNavigate?: () => void
  className?: string
}

const lectureIcon: Record<string, typeof Play> = {
  VIDEO: Play,
  TEXT: FileText,
  QUIZ: HelpCircle,
  PDF: FileText,
  VOICE_OVER_SLIDES: Presentation,
  DOWNLOADABLE: Download,
  SCORM: Boxes,
  XAPI: Boxes,
  HTML: Boxes,
}

export function LectureSidebar({
  courseId,
  courseTitle,
  currentLectureId,
  courseProgress,
  sections,
  lectureProgress,
  onNavigate,
  className,
}: LectureSidebarProps) {
  const totalLectures = sections.reduce((acc, s) => acc + s.lectures.length, 0)
  const currentSectionIndex = sections.findIndex((s) => s.lectures.some((l) => l.id === currentLectureId))

  // Short courses: everything open. Long courses: only the current section.
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    if (totalLectures <= 30) return new Set(sections.map((_, i) => i))
    return new Set(currentSectionIndex >= 0 ? [currentSectionIndex] : [0])
  })
  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  // Keep the current lecture visible when the list opens.
  const currentRef = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center" })
  }, [currentLectureId])

  const completedLectures = sections
    .flatMap((s) => s.lectures)
    .filter((l) => lectureProgress[l.id]?.isCompleted).length

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <div className="border-b p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Course content</p>
        <h2 className="mt-1 line-clamp-2 text-sm font-semibold">{courseTitle}</h2>
        <div className="mt-3 flex items-center gap-2">
          <Progress value={courseProgress} className="h-1.5 flex-1" aria-label="Course progress" />
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {completedLectures}/{totalLectures} · {courseProgress}%
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {sections.map((section, sIndex) => {
          const isOpen = expanded.has(sIndex)
          const done = section.lectures.filter((l) => lectureProgress[l.id]?.isCompleted).length
          return (
            <div key={section.id} className="border-b">
              <button
                type="button"
                onClick={() => toggle(sIndex)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold">
                    {sIndex + 1}. {section.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {done}/{section.lectures.length} completed
                  </p>
                </div>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                  aria-hidden="true"
                />
              </button>

              {isOpen && (
                <ol className="pb-1">
                  {section.lectures.map((lecture, lIndex) => {
                    const isCompleted = lectureProgress[lecture.id]?.isCompleted
                    const isCurrent = lecture.id === currentLectureId
                    const Icon = lectureIcon[lecture.type] || FileText
                    return (
                      <li key={lecture.id}>
                        <Link
                          ref={isCurrent ? currentRef : undefined}
                          href={`/my-courses/${courseId}/lectures/${lecture.id}`}
                          onClick={onNavigate}
                          aria-current={isCurrent ? "page" : undefined}
                          className={cn(
                            "flex items-start gap-3 border-l-2 px-4 py-2.5 text-sm transition-colors",
                            isCurrent
                              ? "border-l-foreground bg-muted font-medium"
                              : "border-l-transparent hover:bg-muted/50"
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Completed" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 leading-snug">
                              {sIndex + 1}.{lIndex + 1} {lecture.title}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                              <Icon className="h-3 w-3" aria-hidden="true" />
                              {lecture.videoDuration
                                ? formatClock(lecture.videoDuration)
                                : LECTURE_TYPE_LABEL[lecture.type] ?? "Lecture"}
                              {isCurrent && <span className="ml-1 font-medium text-foreground">· Now playing</span>}
                            </p>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
