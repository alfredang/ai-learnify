"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Star, Loader2, CheckCircle2 } from "lucide-react"
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
  survey: {
    title: string
    description: string | null
    questions: Question[]
  } | null
  /** Redirect the learner here after a successful submit. */
  redirectTo?: string
}

type Answer = string | string[] | number | null

/**
 * Learner-facing survey submission. Captures a mandatory 1-5 star rating
 * (spec §6 step 5) plus author-defined questions. On submit, the API
 * triggers `maybeIssueCertificate` so a cert can drop immediately if this
 * was the last blocker.
 */
export function SurveyForm({ courseId, survey, redirectTo }: Props) {
  const router = useRouter()
  const [stars, setStars] = useState<number>(0)
  const [hoverStars, setHoverStars] = useState<number>(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{
    certIssued?: { certificateId: string } | null
  } | null>(null)

  function setAnswer(id: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  function validate(): string | null {
    if (stars < 1) return "Please give a star rating."
    for (const q of survey?.questions ?? []) {
      if (!q.required) continue
      const a = answers[q.id]
      const empty =
        a === null ||
        a === undefined ||
        (typeof a === "string" && a.trim().length === 0) ||
        (Array.isArray(a) && a.length === 0) ||
        (typeof a === "number" && !Number.isFinite(a))
      if (empty) return `Please answer: "${q.prompt}"`
    }
    return null
  }

  async function handleSubmit() {
    const err = validate()
    if (err) {
      toast.error(err)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starRating: stars, answersJson: answers }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Submit failed")
      setSubmitted({ certIssued: data.certIssued ?? null })
      if (data.certIssued) {
        toast.success(`Certificate issued: ${data.certIssued.certificateId}`)
      } else {
        toast.success("Thanks for your feedback!")
      }
      if (redirectTo) {
        setTimeout(() => router.push(redirectTo), 1500)
      } else {
        router.refresh()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submit failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="p-10 text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
          <h2 className="text-xl font-bold">Thanks for your feedback</h2>
          {submitted.certIssued ? (
            <p className="text-sm text-muted-foreground">
              Your certificate <span className="font-mono">{submitted.certIssued.certificateId}</span> has been issued.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your response has been recorded.
            </p>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{survey?.title ?? "Course feedback"}</CardTitle>
        {survey?.description && (
          <p className="text-sm text-muted-foreground">{survey.description}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-sm">Overall rating</Label>
          <div
            className="flex items-center gap-1"
            onMouseLeave={() => setHoverStars(0)}
          >
            {[1, 2, 3, 4, 5].map((n) => {
              const filled = n <= (hoverStars || stars)
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  onMouseEnter={() => setHoverStars(n)}
                  onClick={() => setStars(n)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-7 w-7",
                      filled
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              )
            })}
            <span className="ml-2 text-sm text-muted-foreground">
              {stars > 0 ? `${stars} / 5` : "Tap to rate"}
            </span>
          </div>
        </div>

        {(survey?.questions ?? []).map((q, idx) => (
          <div key={q.id} className="space-y-2">
            <Label className="text-sm">
              {idx + 1}. {q.prompt}{" "}
              {q.required && <span className="text-destructive">*</span>}
            </Label>

            {q.type === "text" && (
              <Textarea
                rows={3}
                value={(answers[q.id] as string) ?? ""}
                onChange={(e) => setAnswer(q.id, e.target.value)}
              />
            )}

            {q.type === "rating" && (
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const val = (answers[q.id] as number) ?? 0
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAnswer(q.id, n)}
                      className={cn(
                        "h-9 w-9 rounded-md border text-sm font-medium",
                        n <= val
                          ? "bg-primary text-primary-foreground border-primary"
                          : "hover:bg-muted"
                      )}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
            )}

            {q.type === "single_choice" && (
              <div className="space-y-1.5">
                {(q.options ?? []).map((opt) => (
                  <label
                    key={opt}
                    className={cn(
                      "flex items-center gap-2 rounded-md border p-3 text-sm cursor-pointer",
                      answers[q.id] === opt
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswer(q.id, opt)}
                      className="h-4 w-4"
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {q.type === "multi_choice" && (
              <div className="space-y-1.5">
                {(q.options ?? []).map((opt) => {
                  const selected = Array.isArray(answers[q.id])
                    ? (answers[q.id] as string[]).includes(opt)
                    : false
                  return (
                    <label
                      key={opt}
                      className={cn(
                        "flex items-center gap-2 rounded-md border p-3 text-sm cursor-pointer",
                        selected
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const cur = Array.isArray(answers[q.id])
                            ? (answers[q.id] as string[])
                            : []
                          const next = selected
                            ? cur.filter((v) => v !== opt)
                            : [...cur, opt]
                          setAnswer(q.id, next)
                        }}
                        className="h-4 w-4"
                      />
                      <span>{opt}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={submitting || stars < 1}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Submit feedback
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
