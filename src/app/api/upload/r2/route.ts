import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { randomId } from "@/lib/storage"
import { isR2Configured, r2PresignPut, safeKeyPart } from "@/lib/object-storage"

export const runtime = "nodejs"

const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"])
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024 // 2 GB — R2 single PUT allows up to 5 GB

const schema = z.object({
  fileName: z.string().min(1).max(300),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
})

/**
 * POST /api/upload/r2 — returns a short-lived presigned PUT URL so the
 * browser uploads a lecture video directly to Cloudflare R2. Responds 503
 * with code R2_NOT_CONFIGURED when R2 isn't set up, which the uploader
 * uses as the signal to fall back to the local store.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized", code: "AUTH_REQUIRED" }, { status: 401 })
  }
  const legacyAllowed = session.user.role === "INSTRUCTOR" || session.user.role === "ADMIN"
  const isPlatformOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isStaff = (session.user.memberships ?? []).some(
    (m) => m.role === "ACADEMY_ADMIN" || m.role === "COURSE_DEVELOPER"
  )
  if (!legacyAllowed && !isPlatformOwner && !isStaff) {
    return NextResponse.json({ error: "You do not have permission to upload files", code: "ROLE_FORBIDDEN" }, { status: 403 })
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "Cloud storage is not configured", code: "R2_NOT_CONFIGURED" }, { status: 503 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }
  const { fileName, contentType, size } = parsed.data
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    return NextResponse.json({ error: `Unsupported file type: ${contentType}`, code: "UNSUPPORTED_TYPE" }, { status: 400 })
  }
  if (size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video larger than 2 GB", code: "FILE_TOO_LARGE" }, { status: 413 })
  }

  const key = `videos/${new Date().toISOString().slice(0, 7)}/${randomId(6)}-${safeKeyPart(fileName)}`
  const signed = await r2PresignPut(key, contentType)
  return NextResponse.json({ ...signed, contentType })
}
