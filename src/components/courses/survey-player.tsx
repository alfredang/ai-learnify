"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Star, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface SurveyPlayerProps {
  courseId: string
  courseTitle: string
  onSubmitted?: (result: { certIssued: boolean; certificateId?: string | null }) => void
}

/**
 * Phase 5: minimal mandatory survey (spec §7.4). A star rating (1-5) plus a
 * free-text "what would you improve?". Completion-based, does not affect
 * score, but required for certificate per the default CertificateRule.
 */
export function SurveyPlayer({ courseId, courseTitle, onSubmitted }: SurveyPlayerProps) {
  const [rating, setRating] = useState<number>(0)
  const [comment, setComment] = useState<string>("")
  const [submitted, setSubmitted] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(false)

  async function handleSubmit() {
    if (rating < 1) {
      toast.error("Please select a star rating before submitting.")
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/courses/${courseId}/survey`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starRating: rating,
          answersJson: { comment },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Could not submit survey")
      }
      const data = (await res.json()) as {
        certIssued: { id?: string; certificateId?: string | null } | null
      }
      setSubmitted(true)
      if (data.certIssued) {
        toast.success("Certificate issued!")
        onSubmitted?.({
          certIssued: true,
          certificateId: data.certIssued.certificateId ?? null,
        })
      } else {
        toast.success("Thanks — your feedback has been recorded.")
        onSubmitted?.({ certIssued: false })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-600" />
          <h3 className="text-lg font-semibold">Thanks for your feedback!</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Your response helps the instructor improve the course.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-5">
        <div>
          <h3 className="text-lg font-semibold">How was {courseTitle}?</h3>
          <p className="text-sm text-muted-foreground">
            Completing this survey is required to receive your certificate.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">Your rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setRating(v)}
                aria-label={`Rate ${v} stars`}
                className="group"
                disabled={loading}
              >
                <Star
                  className={cn(
                    "h-8 w-8 transition-colors",
                    v <= rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground group-hover:text-yellow-400"
                  )}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="comment" className="mb-2 block text-sm font-medium">
            What could be improved? <span className="text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share anything you'd like us to know."
            rows={4}
            disabled={loading}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={loading || rating < 1}
          className="w-full"
          size="lg"
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Submit feedback
        </Button>
      </CardContent>
    </Card>
  )
}
