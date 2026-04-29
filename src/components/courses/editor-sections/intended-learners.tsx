"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
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

    const userPrompt = [
      `Course title: ${titleClean}`,
      courseSubtitle ? `Subtitle: ${courseSubtitle.trim()}` : null,
      descriptionClean ? `Existing description: ${descriptionClean}` : null,
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI Assist failed")
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiAssist}
            disabled={aiBusy}
            title={
              courseTitle?.trim()
                ? "Draft objectives, requirements, and audience using the course title as context."
                : "Set the course title first."
            }
          >
            {aiBusy ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            AI Assist
          </Button>
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
