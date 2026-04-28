"use client"

import { LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface BuyNowButtonProps {
  courseId: string
  courseSlug: string
  isFree: boolean
  expectedPrice?: number
  className?: string
}

export function BuyNowButton({
  courseSlug,
  isFree,
  className,
}: BuyNowButtonProps) {
  const { data: session } = useSession()
  const router = useRouter()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!session?.user) {
      router.push("/login?callbackUrl=" + encodeURIComponent(`/courses/${courseSlug}/enroll`))
      return
    }

    router.push(`/courses/${courseSlug}/enroll`)
  }

  return (
    <Button
      variant="outline"
      size="lg"
      className={cn("w-full", className)}
      onClick={handleClick}
    >
      <LogIn className="h-4 w-4 mr-2" />
      {isFree ? "Enrol for Free" : "Join / Enrol"}
    </Button>
  )
}
