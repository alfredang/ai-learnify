"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Loader2, Trophy, RotateCcw } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props {
  courseId: string
  assessmentPassMark: number
  retakesAllowed: number
  onSaved: () => void
}

const RETAKE_PRESETS = [
  { value: "-1", label: "Unlimited (default)" },
  { value: "0", label: "No retakes" },
  { value: "1", label: "1 retake" },
  { value: "2", label: "2 retakes" },
  { value: "3", label: "3 retakes" },
  { value: "5", label: "5 retakes" },
]

export function AssessmentRulesSection({
  courseId,
  assessmentPassMark,
  retakesAllowed,
  onSaved,
}: Props) {
  const [passMark, setPassMark] = useState(assessmentPassMark)
  const [retakes, setRetakes] = useState(retakesAllowed)
  const [isSaving, setIsSaving] = useState(false)
  const initialRef = useRef(true)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  useEffect(() => {
    if (initialRef.current) {
      initialRef.current = false
      return
    }
    const handle = setTimeout(async () => {
      if (passMark < 50 || passMark > 100) return
      if (retakes < -1) return
      setIsSaving(true)
      try {
        const res = await fetch(`/api/courses/${courseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assessmentPassMark: passMark,
            retakesAllowed: retakes,
          }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || "Failed to save")
        }
        onSavedRef.current()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save")
      } finally {
        setIsSaving(false)
      }
    }, 1200)
    return () => clearTimeout(handle)
  }, [passMark, retakes, courseId])

  const retakeValue = String(retakes)
  const isCustomRetake = !RETAKE_PRESETS.some((p) => p.value === retakeValue)

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Assessment rules</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure pass mark and retake policy for graded quizzes in this course.
          </p>
        </div>
        {isSaving && (
          <span className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </span>
        )}
      </div>

      <div className="space-y-6">
        <div className="rounded-lg border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-600" />
            <Label htmlFor="passmark" className="text-sm font-semibold">
              Pass mark
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Minimum percentage a learner must score on the course assessment to qualify for certification. Spec default is 80%.
          </p>
          <div className="flex items-center gap-3 max-w-sm">
            <Input
              id="passmark"
              type="number"
              min={50}
              max={100}
              step={1}
              value={passMark}
              onChange={(e) => setPassMark(parseInt(e.target.value) || 0)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          {(passMark < 50 || passMark > 100) && (
            <p className="text-xs text-destructive">
              Pass mark must be between 50 and 100.
            </p>
          )}
        </div>

        <div className="rounded-lg border p-5 space-y-3">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-purple-600" />
            <Label htmlFor="retakes" className="text-sm font-semibold">
              Retakes allowed
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            How many extra attempts a learner gets after their first try. Spec default is unlimited.
          </p>
          <div className="space-y-2 max-w-sm">
            <Select
              value={isCustomRetake ? "custom" : retakeValue}
              onValueChange={(v) => {
                if (v === "custom") return
                setRetakes(parseInt(v))
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETAKE_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                {isCustomRetake && (
                  <SelectItem value="custom">Custom: {retakes}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={-1}
              value={retakes}
              onChange={(e) => setRetakes(parseInt(e.target.value) || 0)}
              placeholder="Or enter a custom number"
              className="text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Use <code>-1</code> for unlimited, <code>0</code> for no retakes, or any positive number.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 space-y-1">
          <p className="font-semibold">How weighted scoring works</p>
          <p>
            Each quiz question carries a configurable point value (set in the Quiz builder). The learner&apos;s score is the sum of points from correct answers divided by the total points. The pass mark above is checked against this percentage.
          </p>
        </div>
      </div>
    </div>
  )
}
