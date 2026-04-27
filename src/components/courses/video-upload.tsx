"use client"

import { useState, useRef, useCallback } from "react"
import { Upload, X, Film, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

// 50MB limit for Cloudinary free tier
// TODO: Increase to standard Cloudinary limit for production
const MAX_FILE_SIZE_MB = 50
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

interface VideoUploadProps {
  onUploadComplete: (data: {
    videoUrl: string
    videoPublicId: string
    videoDuration: number
  }) => void
  onUploadStart?: () => void
  onUploadCancel?: () => void
  existingVideoUrl?: string | null
  existingThumbnail?: string | null
  disabled?: boolean
}

type UploadState = "idle" | "uploading" | "success" | "error"

export function VideoUpload({
  onUploadComplete,
  onUploadStart,
  onUploadCancel,
  existingVideoUrl,
  existingThumbnail,
  disabled = false,
}: VideoUploadProps) {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState("")
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState("")

  const xhrRef = useRef<XMLHttpRequest | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isUploading = uploadState === "uploading"

  const resetState = useCallback(() => {
    setUploadState("idle")
    setProgress(0)
    setErrorMessage("")
    setPreviewUrl(null)
    setFileName("")
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }, [])

  const cancelUpload = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort()
      xhrRef.current = null
    }
    resetState()
    onUploadCancel?.()
  }, [resetState, onUploadCancel])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith("video/")) {
      setErrorMessage("Please select a video file")
      setUploadState("error")
      return
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setErrorMessage(
        `File size exceeds ${MAX_FILE_SIZE_MB}MB limit. Please compress the video or choose a smaller file.`
      )
      setUploadState("error")
      return
    }

    setFileName(file.name)
    setErrorMessage("")

    // Create local preview
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)

    // Start upload
    setUploadState("uploading")
    setProgress(0)
    onUploadStart?.()

    try {
      // Get signed upload params
      const sigRes = await fetch("/api/upload/signature")
      if (!sigRes.ok) {
        const sigErr = await sigRes.json().catch(() => ({}))
        throw new Error(sigErr.error || `Signature request failed (${sigRes.status})`)
      }
      const { timestamp, signature, cloudName, apiKey } = await sigRes.json()

      const formData = new FormData()
      formData.append("file", file)
      formData.append("timestamp", String(timestamp))
      formData.append("signature", signature)
      formData.append("api_key", apiKey)
      formData.append(
        "upload_preset",
        process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!
      )
      formData.append("resource_type", "video")

      // Upload via XMLHttpRequest for progress tracking + cancel support
      const result = await new Promise<{
        secure_url: string
        public_id: string
        duration: number
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrRef.current = xhr

        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100)
            setProgress(pct)
          }
        })

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText))
          } else {
            try {
              const errBody = JSON.parse(xhr.responseText)
              const msg = errBody?.error?.message || `Upload failed (${xhr.status})`
              reject(new Error(msg))
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }
        })

        xhr.addEventListener("error", () => reject(new Error("Network error during upload")))
        xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")))

        xhr.open(
          "POST",
          `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`
        )
        xhr.send(formData)
      })

      xhrRef.current = null
      setUploadState("success")

      onUploadComplete({
        videoUrl: result.secure_url,
        videoPublicId: result.public_id,
        videoDuration: Math.round(result.duration || 0),
      })
    } catch (err) {
      xhrRef.current = null
      if (err instanceof Error && err.message === "Upload cancelled") {
        // Already handled by cancelUpload
        return
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Upload failed"
      )
      setUploadState("error")
    }
  }

  // Show existing video thumbnail if no new upload
  const showExisting =
    !previewUrl && (existingVideoUrl || existingThumbnail) && uploadState === "idle"

  return (
    <div className="space-y-3">
      {/* Upload area */}
      {uploadState === "idle" && !showExisting && (
        <label
          className={cn(
            "flex flex-col items-center justify-center w-full h-44 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
            "hover:bg-muted/50 hover:border-primary/50",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Upload className="h-8 w-8" />
            <p className="text-sm font-medium">Click to upload video</p>
            <p className="text-xs">
              MP4, WebM, MOV &middot; Max {MAX_FILE_SIZE_MB}MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled || isUploading}
          />
        </label>
      )}

      {/* Existing video preview */}
      {showExisting && (
        <div className="relative rounded-lg overflow-hidden border bg-black">
          {existingThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={existingThumbnail}
              alt="Video thumbnail"
              className="w-full h-44 object-cover"
            />
          ) : (
            <div className="flex items-center justify-center h-44">
              <Film className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-3 py-2 flex items-center justify-between">
            <span className="text-white text-xs truncate">Current video</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-white hover:text-white hover:bg-white/20"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              Replace
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
            disabled={disabled}
          />
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm truncate">{fileName}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={cancelUpload}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {progress}% uploaded
          </p>
        </div>
      )}

      {/* Success state with preview */}
      {uploadState === "success" && previewUrl && (
        <div className="space-y-3">
          <div className="relative rounded-lg overflow-hidden border bg-black">
            <video
              src={previewUrl}
              className="w-full h-44 object-contain bg-black"
              controls
              preload="metadata"
            />
            <div className="absolute top-2 right-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 text-xs"
                onClick={resetState}
                disabled={disabled}
              >
                Change
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-green-600">
            <CheckCircle2 className="h-4 w-4" />
            <span>Video uploaded successfully</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {uploadState === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={resetState}
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
