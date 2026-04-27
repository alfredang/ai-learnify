"use client"

import { useState, useTransition } from "react"
import { Heart } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface FavouriteButtonProps {
  courseId: string
  initialFavourited?: boolean
  variant?: "icon" | "full"
  className?: string
}

export function FavouriteButton({
  courseId,
  initialFavourited = false,
  variant = "icon",
  className,
}: FavouriteButtonProps) {
  const [favourited, setFavourited] = useState(initialFavourited)
  const [isPending, startTransition] = useTransition()
  const { data: session } = useSession()
  const router = useRouter()

  function handleToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()

    if (!session?.user) {
      router.push("/login?callbackUrl=" + encodeURIComponent(window.location.pathname))
      return
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/favourites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || "Failed to update favourites")
        }

        const data = await res.json()
        setFavourited(data.favourited)

        toast.success(
          data.favourited ? "Added to favourites" : "Removed from favourites"
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update favourites"
        )
      }
    })
  }

  if (variant === "full") {
    return (
      <Button
        variant="outline"
        size="lg"
        className={cn("w-full", className)}
        onClick={handleToggle}
        disabled={isPending}
      >
        <Heart
          className={cn(
            "h-4 w-4 mr-2",
            favourited && "fill-red-500 text-red-500"
          )}
        />
        {favourited ? "Favourited" : "Add to Favourites"}
      </Button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={cn(
        "rounded-full bg-white p-2 shadow-md transition-all hover:scale-110",
        isPending && "opacity-50",
        className
      )}
      aria-label={favourited ? "Remove from favourites" : "Add to favourites"}
    >
      <Heart
        className={cn(
          "h-5 w-5",
          favourited ? "fill-red-500 text-red-500" : "text-slate-700"
        )}
      />
    </button>
  )
}
