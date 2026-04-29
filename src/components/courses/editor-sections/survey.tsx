"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { nanoid } from "nanoid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Plus, Trash2, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"

type QuestionType = "text" | "rating" | "single_choice" | "multi_choice"

type Question = {
  id: string
  prompt: string
  type: QuestionType
  required?: boolean
  options?: string[]
}

interface Props {
  courseId: string
  onSaved: () => void
}

const TYPE_LABEL: Record<QuestionType, string> = {
  text: "Free text",
  rating: "1-5 rating",
  single_choice: "Single choice",
  multi_choice: "Multi choice",
}

function newQuestion(type: QuestionType = "text"): Question {
  return {
    id: `q_${nanoid(8)}`,
    prompt: "",
    type,
    required: true,
    options: type === "single_choice" || type === "multi_choice" ? [""] : undefined,
  }
}

export function SurveySection({ courseId, onSaved }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState("Course survey")
  const [description, setDescription] = useState("")
  const [mandatory, setMandatory] = useState(true)
  const [showRatingPublicly, setShowRatingPublicly] = useState(false)
  const [questions, setQuestions] = useState<Question[]>([])
  const [hasData, setHasData] = useState(false)

  const hasInitialized = useRef(false)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/courses/${courseId}/survey`)
        if (!cancelled && res.ok) {
          const data = (await res.json()) as {
            survey: {
              title: string
              description: string | null
              questionsJson: { questions?: Question[] } | null
              isMandatoryForCert: boolean
              showRatingPublicly?: boolean
            } | null
          }
          if (data.survey) {
            setTitle(data.survey.title)
            setDescription(data.survey.description ?? "")
            setMandatory(data.survey.isMandatoryForCert)
            setShowRatingPublicly(!!data.survey.showRatingPublicly)
            setQuestions(data.survey.questionsJson?.questions ?? [])
            setHasData(true)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [courseId])

  // Debounced autosave — mirrors the pattern in IntendedLearnersSection.
  useEffect(() => {
    if (loading) return
    if (!hasInitialized.current) {
      hasInitialized.current = true
      return
    }

    const timeout = setTimeout(async () => {
      setSaving(true)
      try {
        const res = await fetch(`/api/courses/${courseId}/survey`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: description || null,
            isMandatoryForCert: mandatory,
            showRatingPublicly,
            questions: questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              type: q.type,
              required: q.required ?? true,
              options:
                q.type === "single_choice" || q.type === "multi_choice"
                  ? (q.options ?? []).filter((o) => o.trim().length > 0)
                  : undefined,
            })),
          }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error ?? "Failed to save")
        }
        setHasData(true)
        onSavedRef.current()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save")
      } finally {
        setSaving(false)
      }
    }, 1200)

    return () => clearTimeout(timeout)
  }, [courseId, title, description, mandatory, showRatingPublicly, questions, loading])

  function updateQuestion(idx: number, patch: Partial<Question>) {
    setQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    )
  }

  function addQuestion() {
    setQuestions((prev) => [...prev, newQuestion("text")])
  }

  function removeQuestion(idx: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveQuestion(from: number, to: number) {
    if (to < 0 || to >= questions.length) return
    setQuestions((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(from, 1)
      copy.splice(to, 0, moved)
      return copy
    })
  }

  function addOption(qIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx ? { ...q, options: [...(q.options ?? []), ""] } : q
      )
    )
  }

  function removeOption(qIdx: number, oIdx: number) {
    setQuestions((prev) =>
      prev.map((q, i) =>
        i === qIdx
          ? { ...q, options: (q.options ?? []).filter((_, j) => j !== oIdx) }
          : q
      )
    )
  }

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Course survey</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Required by spec §7.4 and §12 for certification. Completion (not
            score) gates the cert — open-ended answers are not auto-graded.
          </p>
        </div>
        {saving && (
          <Badge variant="secondary" className="mt-1">
            <Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Survey details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown above the survey for learners."
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">Required for certificate</Label>
              <p className="text-xs text-muted-foreground">
                When on, learners must submit this survey before a certificate
                can issue (spec §12).
              </p>
            </div>
            <Switch checked={mandatory} onCheckedChange={setMandatory} />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">
                Show average star rating on public course page
              </Label>
              <p className="text-xs text-muted-foreground">
                Spec §7.4 — opt-in. When on, the aggregated learner rating
                appears on the public course detail page.
              </p>
            </div>
            <Switch
              checked={showRatingPublicly}
              onCheckedChange={setShowRatingPublicly}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">
            Questions{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({questions.length})
            </span>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addQuestion}>
            <Plus className="h-4 w-4 mr-1" /> Add question
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {questions.length === 0 ? (
            <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
              No questions yet — the learner will still give a 1-5 star rating
              on submit. Add questions to collect targeted feedback.
            </div>
          ) : (
            questions.map((q, idx) => (
              <div
                key={q.id}
                className="border rounded-md p-4 space-y-3 bg-muted/20"
              >
                <div className="flex items-start gap-2">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, idx - 1)}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    <button
                      type="button"
                      onClick={() => moveQuestion(idx, idx + 1)}
                      disabled={idx === questions.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label className="text-xs">
                          Question {idx + 1}
                        </Label>
                        <Input
                          value={q.prompt}
                          onChange={(e) =>
                            updateQuestion(idx, { prompt: e.target.value })
                          }
                          placeholder="What did you think of the pacing?"
                        />
                      </div>
                      <div className="w-40">
                        <Label className="text-xs">Type</Label>
                        <Select
                          value={q.type}
                          onValueChange={(v) =>
                            updateQuestion(idx, {
                              type: v as QuestionType,
                              options:
                                v === "single_choice" || v === "multi_choice"
                                  ? q.options ?? [""]
                                  : undefined,
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(
                              ["text", "rating", "single_choice", "multi_choice"] as const
                            ).map((t) => (
                              <SelectItem key={t} value={t}>
                                {TYPE_LABEL[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(q.type === "single_choice" || q.type === "multi_choice") && (
                      <div className="space-y-2 pl-1">
                        <Label className="text-xs">Options</Label>
                        {(q.options ?? []).map((opt, oIdx) => (
                          <div key={oIdx} className="flex gap-2">
                            <Input
                              value={opt}
                              onChange={(e) => {
                                const next = [...(q.options ?? [])]
                                next[oIdx] = e.target.value
                                updateQuestion(idx, { options: next })
                              }}
                              placeholder={`Option ${oIdx + 1}`}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeOption(idx, oIdx)}
                              disabled={(q.options ?? []).length <= 1}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => addOption(idx)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add option
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={q.required ?? true}
                          onCheckedChange={(v) =>
                            updateQuestion(idx, { required: v })
                          }
                        />
                        <span className="text-muted-foreground">Required</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeQuestion(idx)}
                        className={cn("text-destructive hover:text-destructive")}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove question
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {!hasData && (
        <p className="text-xs text-muted-foreground">
          Survey will be created on first save.
        </p>
      )}
    </div>
  )
}
