"use client"

import { useState } from "react"
import { Sparkles, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

interface Props {
  courseId: string
  academyId: string | null | undefined
  courseTitle: string
  onGenerated: () => void
}

interface OutlineSection {
  title: string
  summary?: string
  lectures: Array<{ title: string; type: "VIDEO" | "TEXT" | "QUIZ" }>
}

export function CurriculumAiButton({
  courseId,
  academyId,
  courseTitle,
  onGenerated,
}: Props) {
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState(4)
  const [lecturesPer, setLecturesPer] = useState(1)
  const [focus, setFocus] = useState("")
  const [loading, setLoading] = useState(false)

  if (!academyId) return null

  async function handleGenerate() {
    setLoading(true)
    try {
      // 1) Ask the AI for an outline matching the requested shape.
      const userPrompt = [
        `Course title: ${courseTitle}`,
        `Sections: ${sections}`,
        `Lectures per section: ${lecturesPer}`,
        focus.trim() ? `Focus areas: ${focus.trim()}` : null,
        "",
        `Draft a course outline for "${courseTitle}" with exactly ${sections} sections and ${lecturesPer} lectures per section. Mix lecture types (VIDEO / TEXT / QUIZ) sensibly. Return the JSON shape specified in the system prompt — no time estimates.`,
      ]
        .filter(Boolean)
        .join("\n")

      const aiRes = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "OUTLINE",
          academyId,
          userPrompt,
          context: { courseId, source: "curriculum-builder" },
        }),
      })
      const aiData = await aiRes.json()
      if (!aiRes.ok) throw new Error(aiData.error ?? "AI generate failed")

      const parsed = aiData.parsed as { sections?: OutlineSection[] } | null
      const outlineSections = Array.isArray(parsed?.sections) ? parsed!.sections : []
      if (outlineSections.length === 0) {
        throw new Error("AI returned no sections — try again or add manually.")
      }

      // 2) Create sections + lectures sequentially via the existing APIs.
      let createdSections = 0
      let createdLectures = 0
      for (const sec of outlineSections) {
        const secRes = await fetch(`/api/courses/${courseId}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: (sec.title ?? "Untitled section").slice(0, 100),
            description: sec.summary ?? "",
          }),
        })
        if (!secRes.ok) continue
        const secJson = await secRes.json()
        const sectionId: string | undefined = secJson?.section?.id
        if (!sectionId) continue
        createdSections++

        for (const lec of sec.lectures ?? []) {
          const type = lec.type === "TEXT" || lec.type === "QUIZ" ? lec.type : "VIDEO"
          await fetch(
            `/api/courses/${courseId}/sections/${sectionId}/lectures`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: (lec.title ?? "Untitled lecture").slice(0, 100),
                type,
              }),
            }
          )
          createdLectures++
        }
      }

      toast.success(
        `Created ${createdSections} section${createdSections === 1 ? "" : "s"} · ${createdLectures} lecture${createdLectures === 1 ? "" : "s"}`
      )
      setOpen(false)
      onGenerated()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Generate with AI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate course outline
          </DialogTitle>
          <DialogDescription>
            Tell the AI how to structure the course. It will create the sections
            and lectures for you — you can rename, reorder, or delete any of them
            after.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sections-count" className="text-xs">
                Number of sections
              </Label>
              <Input
                id="sections-count"
                type="number"
                min={1}
                max={8}
                value={sections}
                onChange={(e) =>
                  setSections(
                    Math.max(1, Math.min(8, parseInt(e.target.value) || 1))
                  )
                }
              />
              <p className="text-[11px] text-muted-foreground">1–8</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lectures-count" className="text-xs">
                Lectures per section
              </Label>
              <Input
                id="lectures-count"
                type="number"
                min={1}
                max={8}
                value={lecturesPer}
                onChange={(e) =>
                  setLecturesPer(
                    Math.max(1, Math.min(8, parseInt(e.target.value) || 1))
                  )
                }
              />
              <p className="text-[11px] text-muted-foreground">1–8</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="focus-areas" className="text-xs">
              Focus areas (optional)
            </Label>
            <Textarea
              id="focus-areas"
              rows={3}
              placeholder="e.g. emphasise hands-on examples, include a quiz at the end of each section"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            This will create {sections} section{sections === 1 ? "" : "s"} ×{" "}
            {lecturesPer} lecture{lecturesPer === 1 ? "" : "s"} ={" "}
            <strong>{sections * lecturesPer} lectures total</strong>.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
