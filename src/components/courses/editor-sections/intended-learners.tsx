"use client"

import { useState, useEffect, useRef } from "react"
import { toast } from "sonner"
import { EditableListField } from "@/components/shared/editable-list-field"
import { AiAssistButton } from "@/components/shared/ai-assist-button"

interface IntendedLearnersProps {
  courseId: string
  academyId?: string | null
  learningOutcomes: string[]
  requirements: string[]
  targetAudience: string[]
  onSaved: () => void
}

export function IntendedLearnersSection({
  courseId,
  academyId,
  learningOutcomes: initialOutcomes,
  requirements: initialRequirements,
  targetAudience: initialAudience,
  onSaved,
}: IntendedLearnersProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [learningOutcomes, setLearningOutcomes] = useState<string[]>(initialOutcomes || [])
  const [requirements, setRequirements] = useState<string[]>(initialRequirements || [])
  const [targetAudience, setTargetAudience] = useState<string[]>(initialAudience || [])

  const hasInitialized = useRef(false)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  // Debounced auto-save
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
          <AiAssistButton
            capability="OBJECTIVES"
            academyId={academyId}
            label="Draft learning objectives"
            description="Describe the course topic and target audience; the AI drafts 4–7 action-verb objectives you can edit before saving."
            placeholder="Topic / audience / end state (e.g. 'Beginners with no coding experience will be able to build a personal portfolio site in React.')"
            context={{ courseId }}
            onAccept={({ parsed }) => {
              const obj =
                parsed && typeof parsed === "object"
                  ? (parsed as Record<string, unknown>)
                  : null
              const arr = Array.isArray(obj?.objectives) ? obj.objectives : null
              if (arr && arr.every((v) => typeof v === "string")) {
                setLearningOutcomes((prev) => [
                  ...prev.filter((v) => v.trim().length > 0),
                  ...(arr as string[]),
                ])
                toast.success(`Added ${arr.length} draft objectives`)
              } else {
                toast.error("Couldn't parse objectives — check the draft format")
              }
            }}
          />
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
