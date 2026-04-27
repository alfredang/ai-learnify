"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"

export type BannerSlide = {
  id: string
  imageUrl: string
  title: string | null
  targetUrl: string | null
}

interface BannerRotatorProps {
  slides: BannerSlide[]
  // Milliseconds between auto-rotations. Academy Admin can override this in a
  // later phase; default is 6s per IESA LMS spec §4.1 (auto-configurable).
  intervalMs?: number
}

/**
 * Spec §4.1: advertising banner carousel, up to 10 rotating banners.
 * Pauses on hover, resumes on leave, skips rotation when only one slide.
 */
export function BannerRotator({ slides, intervalMs = 6000 }: BannerRotatorProps) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (slides.length <= 1 || paused) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, intervalMs)
    return () => clearInterval(id)
  }, [slides.length, paused, intervalMs])

  if (slides.length === 0) return null

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg bg-muted aspect-[16/5] md:aspect-[16/4]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((slide, i) => {
        const content = (
          <Image
            src={slide.imageUrl}
            alt={slide.title ?? ""}
            fill
            className="object-cover"
            sizes="100vw"
            priority={i === 0}
          />
        )
        return (
          <div
            key={slide.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
            aria-hidden={i !== index}
          >
            {slide.targetUrl ? (
              <Link href={slide.targetUrl} className="block h-full w-full">
                {content}
              </Link>
            ) : (
              content
            )}
            {slide.title && (
              <div className="absolute bottom-4 left-4 max-w-[80%] rounded bg-black/50 px-3 py-1.5 text-sm font-medium text-white backdrop-blur-sm md:text-base">
                {slide.title}
              </div>
            )}
          </div>
        )
      })}

      {slides.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-white" : "w-1.5 bg-white/60"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
