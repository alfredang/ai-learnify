"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Loader2, Play, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface EnrolCtaProps {
  courseId: string
  courseSlug: string
  isFree: boolean
  isEnrolled: boolean
  /** Lecture URL the learner should land on (next incomplete, or first). */
  startHref: string | null
  /** True when the learner has already completed at least one lecture. */
  hasProgress?: boolean
  size?: "default" | "lg"
  className?: string
}

/**
 * Primary course call-to-action.
 *
 *  - Enrolled → "Start course" / "Continue learning", straight into the
 *    next lecture (no intermediate overview page).
 *  - Signed-out → login, then back to the enrolment step.
 *  - Free + signed-in → one-click enrol, then straight into lecture 1.
 *  - Paid + signed-in → the checkout summary page.
 */
export function EnrolCta({
  courseId,
  courseSlug,
  isFree,
  isEnrolled,
  startHref,
  hasProgress,
  size = "lg",
  className,
}: EnrolCtaProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  if (isEnrolled) {
    return (
      <Button size={size} className={cn("w-full", className)} asChild>
        <Link href={startHref ?? `/my-courses/${courseId}`}>
          <Play className="h-4 w-4 mr-2 fill-current" />
          {hasProgress ? "Continue learning" : "Start course"}
        </Link>
      </Button>
    )
  }

  async function handleClick() {
    if (!session?.user) {
      router.push("/login?callbackUrl=" + encodeURIComponent(`/courses/${courseSlug}/enroll`))
      return
    }
    if (!isFree) {
      router.push(`/courses/${courseSlug}/enroll`)
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || "Could not enrol")
      toast.success("You're enrolled — enjoy the course")
      router.push(startHref ?? data.url ?? `/my-courses/${courseId}`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enrol")
      setLoading(false)
    }
  }

  return (
    <Button size={size} className={cn("w-full", className)} onClick={handleClick} disabled={loading}>
      {loading ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : isFree ? (
        <Play className="h-4 w-4 mr-2 fill-current" />
      ) : null}
      {isFree ? "Enrol free & start learning" : "Enrol now"}
      {!isFree && !loading && <ArrowRight className="h-4 w-4 ml-2" />}
    </Button>
  )
}
