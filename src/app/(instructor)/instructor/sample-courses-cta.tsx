"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SampleCoursesCTA() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleGenerate() {
    setBusy(true)
    try {
      const res = await fetch("/api/instructor/sample-courses", {
        method: "POST",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to generate sample courses")
      }
      const data = await res.json()
      toast.success(
        `Created ${data.courses.length} sample courses as DRAFT. Submit any of them for Academy Admin review when you're ready.`
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate samples")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-6 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-600" />
          Start with sample courses
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Generate four starter courses owned by you. They land as{" "}
          <strong>DRAFT</strong> — submit them for Academy Admin review to
          publish to the public catalogue.
        </p>
      </div>
      <Button
        onClick={handleGenerate}
        disabled={busy}
        className="bg-purple-600 hover:bg-purple-700 text-white shrink-0"
      >
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Generate sample courses
      </Button>
    </div>
  )
}
