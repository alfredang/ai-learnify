/**
 * Cloudinary integration — media CDN for course thumbnails and lecture
 * videos.
 *
 * When configured (all five CLOUDINARY_* / NEXT_PUBLIC_CLOUDINARY_* env
 * vars set), the app uploads directly from the browser to Cloudinary
 * via signed URLs, then references the resulting public IDs from the
 * database (Course.thumbnail, Lecture.videoUrl, Lecture.videoPublicId).
 *
 * When NOT configured, the upload components fall through to:
 *   1. Vercel Blob (if BLOB_READ_WRITE_TOKEN is set) — production-ready
 *      but no auto-generated video thumbnails or transformations.
 *   2. Local disk under /public/uploads — dev only; Vercel's serverless
 *      filesystem is read-only outside /tmp.
 *
 * Setup: see .env.example for the full step-by-step. tl;dr — sign up at
 * cloudinary.com, copy the four dashboard credentials, create one
 * upload preset, paste the five values into env vars.
 *
 * Why Cloudinary over Vercel Blob:
 *   + Auto-thumbnails for video lectures (frame extraction at upload
 *     time) — Blob has no equivalent.
 *   + On-the-fly image resizing/optimisation via URL transformations
 *     — useful for course thumbnails that render at multiple sizes.
 *   + Adaptive video streaming for low-bandwidth viewers.
 *   - Requires an external account vs Blob's one-click Vercel setup.
 */

import { v2 as cloudinary } from "cloudinary"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export { cloudinary }

/**
 * Thrown when an upload-side helper is called before the env vars are
 * set. Caught by `/api/upload/signature` and turned into a clean 503,
 * which the upload components then use as the signal to try Vercel Blob
 * or local disk instead.
 */
export class CloudinaryNotConfiguredError extends Error {
  code = "CLOUDINARY_NOT_CONFIGURED" as const
  constructor() {
    super(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET, NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, and NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env (see .env.example for setup instructions)."
    )
    this.name = "CloudinaryNotConfiguredError"
  }
}

/**
 * Returns true when every Cloudinary env var the app needs is present.
 * The upload preset is checked alongside the credentials because the
 * browser-side upload form needs all four to function.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET &&
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET
  )
}

/**
 * Generates a short-lived signed payload the browser uses to PUT a file
 * directly to Cloudinary. Keeps the API secret on the server — only the
 * timestamp + signature + cloud name + api key + upload preset are
 * exposed to the client.
 *
 * Throws `CloudinaryNotConfiguredError` if any env var is missing.
 */
export function generateUploadSignature() {
  if (!isCloudinaryConfigured()) {
    throw new CloudinaryNotConfiguredError()
  }
  const timestamp = Math.round(new Date().getTime() / 1000)
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      upload_preset: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    },
    process.env.CLOUDINARY_API_SECRET!
  )

  return {
    timestamp,
    signature,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
  }
}

/**
 * Removes an uploaded asset from Cloudinary. Called when a lecture is
 * deleted so we don't accumulate orphan media. Resource type defaults
 * to "video" because that's the more common cleanup case.
 */
export async function deleteAsset(
  publicId: string,
  resourceType: "image" | "video" = "video"
) {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  })
}

/**
 * Returns a 640x360 JPEG thumbnail URL for a video stored in Cloudinary.
 * Uses Cloudinary's URL-based transformation API — no API call needed,
 * the URL itself triggers thumbnail extraction on Cloudinary's edge.
 *
 * Returns null-equivalent (broken URL) if cloud_name isn't configured;
 * callers should check `isCloudinaryConfigured()` first or use the
 * version in `course-content-editor.tsx` which guards on cloud name.
 */
export function getVideoThumbnail(publicId: string): string {
  return cloudinary.url(publicId, {
    resource_type: "video",
    format: "jpg",
    transformation: [
      { width: 640, height: 360, crop: "fill" },
      { start_offset: "0" },
    ],
  })
}
