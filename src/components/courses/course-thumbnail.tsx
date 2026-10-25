import Image from "next/image"
import { BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

interface CourseThumbnailProps {
  src: string | null | undefined
  title: string
  sizes?: string
  priority?: boolean
  className?: string
}

/**
 * Course image with a designed fallback. Courses without a thumbnail get a
 * neutral tile with the title instead of a broken image frame.
 * The parent must be `relative` with an aspect ratio (e.g. `aspect-video`).
 */
export function CourseThumbnail({ src, title, sizes, priority, className }: CourseThumbnailProps) {
  if (src) {
    return (
      <Image
        src={src}
        alt={title}
        fill
        priority={priority}
        sizes={sizes ?? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"}
        className={cn("object-cover", className)}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={title}
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-900 px-6 text-center text-white",
        className
      )}
    >
      <BookOpen className="h-7 w-7 opacity-70" aria-hidden="true" />
      <span className="line-clamp-2 text-sm font-semibold leading-snug">{title}</span>
    </div>
  )
}
