"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EditableListField } from "@/components/shared/editable-list-field"

interface IntendedLearnersProps {
  courseId: string
  academyId?: string | null
  courseTitle?: string | null
  courseSubtitle?: string | null
  courseDescription?: string | null
  learningOutcomes: string[]
  requirements: string[]
  targetAudience: string[]
  onSaved: () => void
}

type AssistResponse = {
  rawText: string
  parsed: unknown | null
}

export function IntendedLearnersSection({
  courseId,
  academyId,
  courseTitle,
  courseSubtitle,
  courseDescription,
  learningOutcomes: initialOutcomes,
  requirements: initialRequirements,
  targetAudience: initialAudience,
  onSaved,
}: IntendedLearnersProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiDialogOpen, setAiDialogOpen] = useState(false)
  const [aiContext, setAiContext] = useState("")
  // Course brief — drives the "Generate everything" flow that fills
  // intended learners, course description, and curriculum from one
  // description so all three sections stay aligned.
  const [courseBrief, setCourseBrief] = useState("")
  const [generateAllBusy, setGenerateAllBusy] = useState(false)
  const [generateAllStep, setGenerateAllStep] = useState<string>("")
  const [learningOutcomes, setLearningOutcomes] = useState<string[]>(initialOutcomes || [])
  const [requirements, setRequirements] = useState<string[]>(initialRequirements || [])
  const [targetAudience, setTargetAudience] = useState<string[]>(initialAudience || [])

  const hasInitialized = useRef(false)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true
      return
    }

    const timeout = setTimeout(async () => {
      setIsSaving(true)
      try {
        const res = await fetch(`/api/courses/${courseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ learningOutcomes, requirements, targetAudience }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || "Failed to save")
        }
        onSavedRef.current()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save")
      } finally {
        setIsSaving(false)
      }
    }, 1500)

    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learningOutcomes, requirements, targetAudience, courseId])

  async function handleAiAssist() {
    if (!academyId) return
    if (aiBusy) return

    const titleClean = (courseTitle ?? "").trim()
    if (!titleClean) {
      toast.error("Set the course title on the Course landing page first — the AI uses it as context.")
      return
    }

    const descriptionClean = (courseDescription ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1500)

    // Use the user's typed context if provided; fall back to the course's
    // existing description from the form. The mock keyword extractor
    // reads "Existing description:" so we put the typed context there
    // when present so it drives the generation directly.
    const contextClean = (aiContext ?? "").trim()
    const effectiveDescription = contextClean || descriptionClean
    const userPrompt = [
      `Course title: ${titleClean}`,
      courseSubtitle ? `Subtitle: ${courseSubtitle.trim()}` : null,
      effectiveDescription ? `Existing description: ${effectiveDescription}` : null,
      "",
      "Draft the Intended Learners section: 4–7 learning objectives, 1–4 requirements/prerequisites, 1–4 target audience profiles. Return the JSON shape specified in the system prompt.",
    ]
      .filter(Boolean)
      .join("\n")

    setAiBusy(true)
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "OBJECTIVES",
          academyId,
          userPrompt,
          context: { courseId, source: "intended-learners-one-click" },
        }),
      })
      const data: AssistResponse & { error?: string; interactionId?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? "AI Assist failed")

      const parsed = (data.parsed && typeof data.parsed === "object")
        ? (data.parsed as Record<string, unknown>)
        : null
      const objectives = Array.isArray(parsed?.objectives)
        ? (parsed!.objectives as unknown[]).filter((v) => typeof v === "string") as string[]
        : []
      const reqs = Array.isArray(parsed?.requirements)
        ? (parsed!.requirements as unknown[]).filter((v) => typeof v === "string") as string[]
        : []
      const aud = Array.isArray(parsed?.audience)
        ? (parsed!.audience as unknown[]).filter((v) => typeof v === "string") as string[]
        : []

      if (objectives.length === 0 && reqs.length === 0 && aud.length === 0) {
        throw new Error("AI returned no draft fields")
      }

      if (objectives.length > 0) setLearningOutcomes(objectives)
      if (reqs.length > 0) setRequirements(reqs)
      if (aud.length > 0) setTargetAudience(aud)

      if (data.interactionId) {
        void fetch("/api/ai/approve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interactionId: data.interactionId }),
        }).catch(() => {})
      }

      const counts = [
        objectives.length && `${objectives.length} objectives`,
        reqs.length && `${reqs.length} requirements`,
        aud.length && `${aud.length} audience entries`,
      ].filter(Boolean).join(", ")
      toast.success(`Drafted ${counts} — review and edit before saving`)
      setAiDialogOpen(false)
      setAiContext("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI Assist failed")
    } finally {
      setAiBusy(false)
    }
  }

  // Generate everything — fills intended learners + course description
  // + curriculum from a single brief. Each step uses the same brief as
  // context so all three sections stay aligned.
  async function handleGenerateAll() {
    if (!academyId) return
    if (!courseBrief.trim()) {
      toast.error("Write a brief description first.")
      return
    }
    if (!courseTitle?.trim()) {
      toast.error("Set the course title first on the Course landing page.")
      return
    }

    setGenerateAllBusy(true)
    try {
      // STEP 1 — intended learners
      setGenerateAllStep("Drafting intended learners...")
      const objPrompt = [
        `Course title: ${courseTitle}`,
        courseSubtitle ? `Subtitle: ${courseSubtitle.trim()}` : null,
        `Existing description: ${courseBrief.trim()}`,
        "",
        "Draft the Intended Learners section: 4-7 learning objectives, 1-4 requirements/prerequisites, 1-4 target audience profiles. Return the JSON shape specified in the system prompt.",
      ]
        .filter(Boolean)
        .join("\n")
      const objRes = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "OBJECTIVES",
          academyId,
          userPrompt: objPrompt,
          context: { courseId, source: "generate-all" },
        }),
      })
      const objData = await objRes.json()
      if (!objRes.ok) throw new Error(objData.error ?? "Objectives generation failed")
      const op = objData.parsed && typeof objData.parsed === "object"
        ? (objData.parsed as Record<string, unknown>) : null
      const newOutcomes = Array.isArray(op?.objectives)
        ? (op!.objectives as unknown[]).filter((v) => typeof v === "string") as string[] : []
      const newReqs = Array.isArray(op?.requirements)
        ? (op!.requirements as unknown[]).filter((v) => typeof v === "string") as string[] : []
      const newAud = Array.isArray(op?.audience)
        ? (op!.audience as unknown[]).filter((v) => typeof v === "string") as string[] : []
      if (newOutcomes.length) setLearningOutcomes(newOutcomes)
      if (newReqs.length) setRequirements(newReqs)
      if (newAud.length) setTargetAudience(newAud)

      // STEP 2 — course description (METADATA capability)
      setGenerateAllStep("Drafting course description...")
      const metaRes = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "METADATA",
          academyId,
          userPrompt: `Course title: ${courseTitle}\n${courseBrief.trim()}\n\nDraft course title, subtitle, description, and SEO keywords.`,
          context: { courseId, source: "generate-all" },
        }),
      })
      const metaData = await metaRes.json()
      if (metaRes.ok) {
        const mp = metaData.parsed && typeof metaData.parsed === "object"
          ? (metaData.parsed as Record<string, unknown>) : null
        const description = typeof mp?.description === "string" ? mp.description : null
        const subtitle = typeof mp?.subtitle === "string" ? mp.subtitle : null
        if (description) {
          await fetch(`/api/courses/${courseId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description,
              ...(subtitle ? { subtitle } : {}),
            }),
          })
        }
      }

      // STEP 3 — curriculum (4 sections × 1 lecture by default, focus areas = brief)
      setGenerateAllStep("Drafting curriculum...")
      const outlineRes = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability: "OUTLINE",
          academyId,
          userPrompt: [
            `Course title: ${courseTitle}`,
            `Sections: 4`,
            `Lectures per section: 1`,
            `Focus areas: ${courseBrief.trim()}`,
            "",
            "Draft a course outline with exactly 4 sections and 1 lecture per section.",
          ].join("\n"),
          context: { courseId, source: "generate-all" },
        }),
      })
      const outlineData = await outlineRes.json()
      let createdSections = 0
      let createdLectures = 0
      if (outlineRes.ok) {
        const op2 = outlineData.parsed && typeof outlineData.parsed === "object"
          ? (outlineData.parsed as Record<string, unknown>) : null
        const sectionsArr = Array.isArray(op2?.sections)
          ? (op2!.sections as Array<{ title?: string; summary?: string; lectures?: Array<{ title?: string; type?: string }> }>)
          : []
        for (const sec of sectionsArr) {
          const secCreate = await fetch(`/api/courses/${courseId}/sections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: (sec.title ?? "Untitled section").slice(0, 100),
              description: sec.summary ?? "",
            }),
          })
          if (!secCreate.ok) continue
          const secJson = await secCreate.json()
          const sectionId: string | undefined = secJson?.section?.id
          if (!sectionId) continue
          createdSections++
          for (const lec of sec.lectures ?? []) {
            const type = lec.type === "TEXT" || lec.type === "QUIZ" ? lec.type : "VIDEO"
            await fetch(`/api/courses/${courseId}/sections/${sectionId}/lectures`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: (lec.title ?? "Untitled lecture").slice(0, 100),
                type,
              }),
            })
            createdLectures++
          }
        }
      }

      toast.success(
        `Generated: ${newOutcomes.length} outcomes, course description, ${createdSections} sections / ${createdLectures} lectures`
      )
      setCourseBrief("")
      onSavedRef.current()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generate all failed")
    } finally {
      setGenerateAllBusy(false)
      setGenerateAllStep("")
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      {/* One-shot generator — write a course brief, AI fills intended
          learners + course description + curriculum so all three sections
          stay aligned to the same description. */}
      {academyId && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">
                Generate the whole course from a description
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Briefly describe what the course teaches. AI will draft
                intended learners, course description, and curriculum
                sections — all aligned to your description. You can edit any
                field afterwards or re-generate individual sections later.
              </p>
            </div>
          </div>
          <Textarea
            rows={3}
            placeholder={`e.g. "This course introduces ${courseTitle ?? "the topic"} from the ground up — covers core concepts, common pitfalls, hands-on examples, and how to apply it to real projects."`}
            value={courseBrief}
            onChange={(e) => setCourseBrief(e.target.value)}
            disabled={generateAllBusy}
            className="bg-background"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {generateAllBusy ? generateAllStep : "Generates 4 sections × 1 lecture by default. You can add more after."}
            </p>
            <Button
              size="sm"
              onClick={handleGenerateAll}
              disabled={
                generateAllBusy ||
                !courseBrief.trim() ||
                !courseTitle?.trim()
              }
            >
              {generateAllBusy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Generate all sections
            </Button>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Intended learners</h2>
          <p className="text-sm text-muted-foreground mt-1">
            The following descriptions will be publicly visible on your Course
            Landing Page and will have a direct impact on your course
            performance. These descriptions will help learners decide if your
            course is right for them.
          </p>
        </div>
        {academyId && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAiDialogOpen(true)}
              disabled={!courseTitle?.trim()}
              title={
                courseTitle?.trim()
                  ? "Tell the AI what your course is about and it will draft the objectives, requirements, and audience for you."
                  : "Set the course title first."
              }
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              AI Assist
            </Button>
            <Dialog open={aiDialogOpen} onOpenChange={(o) => !aiBusy && setAiDialogOpen(o)}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Draft intended learners
                  </DialogTitle>
                  <DialogDescription>
                    Briefly describe what this course teaches. The AI will use
                    your description to draft the objectives, requirements, and
                    audience — all aligned to the same theme.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2">
                  <Label htmlFor="ai-context" className="text-xs">
                    What is this course about?
                  </Label>
                  <Textarea
                    id="ai-context"
                    rows={4}
                    placeholder={`e.g. "This course introduces ${courseTitle ?? "the topic"} from the ground up — covers foundations, common pitfalls, and practical applications."`}
                    value={aiContext}
                    onChange={(e) => setAiContext(e.target.value)}
                    disabled={aiBusy}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Optional but recommended — leave blank to use the existing
                    course description.
                  </p>
                </div>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setAiDialogOpen(false)}
                    disabled={aiBusy}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleAiAssist} disabled={aiBusy}>
                    {aiBusy && (
                      <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    )}
                    Generate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>

      <EditableListField
        values={learningOutcomes}
        onChange={setLearningOutcomes}
        label="What will students learn in your course?"
        description="You must enter at least 4 learning objectives or outcomes that learners can expect to achieve after completing your course."
        placeholder="Example: Define the roles and responsibilities of a project manager"
        minRows={4}
        maxCharacters={160}
        disabled={isSaving}
      />

      <EditableListField
        values={requirements}
        onChange={setRequirements}
        label="What are the requirements or prerequisites for taking your course?"
        description="List the required skills, experience, tools or equipment learners should have prior to taking your course. If there are no requirements, use this space as an opportunity to lower the barrier for beginners."
        placeholder="Example: No programming experience needed. You will learn everything you need to know"
        minRows={1}
        maxCharacters={160}
        disabled={isSaving}
      />

      <EditableListField
        values={targetAudience}
        onChange={setTargetAudience}
        label="Who is this course for?"
        description="Write a clear description of the intended learners for your course who will find your course content valuable. This will help you attract the right learners to your course."
        placeholder="Example: Beginner Python developers curious about data science"
        minRows={1}
        maxCharacters={160}
        disabled={isSaving}
      />
    </div>
  )
}
