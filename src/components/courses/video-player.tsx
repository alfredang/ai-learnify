"use client"

import { useRef, useEffect, useCallback, useState } from "react"
import { cn } from "@/lib/utils"

interface VideoPlayerProps {
  videoUrl: string
  lastPosition?: number
  /** Try to start playback as soon as the video is ready (auto-advance). */
  autoPlay?: boolean
  onTimeUpdate?: (currentTime: number, duration: number) => void
  onEnded?: () => void
  className?: string
}

export function VideoPlayer({
  videoUrl,
  lastPosition = 0,
  autoPlay = false,
  onTimeUpdate,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasResumed, setHasResumed] = useState(false)

  // Resume from last position on load, then optionally autoplay.
  useEffect(() => {
    const video = videoRef.current
    if (!video || hasResumed) return

    const handleLoaded = () => {
      if (lastPosition > 0 && lastPosition < video.duration - 3) {
        video.currentTime = lastPosition
      }
      setHasResumed(true)
      if (autoPlay) {
        // Browsers may block unmuted autoplay; the learner can press play.
        video.play().catch(() => {})
      }
    }

    if (video.readyState >= 1) handleLoaded()
    else video.addEventListener("loadedmetadata", handleLoaded)
    return () => video.removeEventListener("loadedmetadata", handleLoaded)
  }, [lastPosition, hasResumed, autoPlay])

  // Throttled time update reporting
  const lastReportedTime = useRef(0)
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current
    if (!video || !onTimeUpdate) return
    if (Math.abs(video.currentTime - lastReportedTime.current) >= 5) {
      lastReportedTime.current = video.currentTime
      onTimeUpdate(video.currentTime, video.duration)
    }
  }, [onTimeUpdate])

  // Space / K toggles play, J / L seek 10s — only when no input is focused.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const video = videoRef.current
      const target = e.target as HTMLElement | null
      if (!video || !target) return
      if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) || target.isContentEditable) return
      if (e.key === " " || e.key === "k") {
        e.preventDefault()
        if (video.paused) video.play().catch(() => {})
        else video.pause()
      } else if (e.key === "j" || e.key === "ArrowLeft") {
        video.currentTime = Math.max(0, video.currentTime - 10)
      } else if (e.key === "l" || e.key === "ArrowRight") {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div className={cn("relative mx-auto aspect-video w-full max-h-[70vh] bg-black", className)}>
      <video
        ref={videoRef}
        src={videoUrl}
        className="absolute inset-0 h-full w-full object-contain"
        controls
        controlsList="nodownload"
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => onEnded?.()}
      />
    </div>
  )
}
