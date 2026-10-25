import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { randomId, saveFile } from "@/lib/storage"

export const runtime = "nodejs"

// Upload route used when Cloudinary isn't configured. Writes to the
// disk-backed store under STORAGE_DIR (a persistent Docker volume in
// production) and returns a same-origin `/uploads/...` URL served by
// the `/uploads/[...path]` route with Range support.
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
])
const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB
const MAX_VIDEO_BYTES = 500 * 1024 * 1024 // 500MB (matches proxyClientMaxBodySize)

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "AUTH_REQUIRED" },
      { status: 401 }
    )
  }

  const legacyAllowed =
    session.user.role === "INSTRUCTOR" || session.user.role === "ADMIN"
  const isPlatformOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isStaff = (session.user.memberships ?? []).some(
    (m) => m.role === "ACADEMY_ADMIN" || m.role === "COURSE_DEVELOPER"
  )
  if (!legacyAllowed && !isPlatformOwner && !isStaff) {
    return NextResponse.json(
      { error: "You do not have permission to upload files", code: "ROLE_FORBIDDEN" },
      { status: 403 }
    )
  }

  const formData = await request.formData()
  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field", code: "BAD_REQUEST" },
      { status: 400 }
    )
  }

  const isImage = ALLOWED_IMAGE_TYPES.has(file.type)
  const isVideo = ALLOWED_VIDEO_TYPES.has(file.type)
  if (!isImage && !isVideo) {
    return NextResponse.json(
      {
        error: `Unsupported file type: ${file.type}`,
        code: "UNSUPPORTED_TYPE",
      },
      { status: 400 }
    )
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES
  if (file.size > max) {
    return NextResponse.json(
      {
        error: `File too large (${file.size} bytes, max ${max}).`,
        code: "FILE_TOO_LARGE",
      },
      { status: 413 }
    )
  }

  const kind = isImage ? "images" : "videos"
  const ext = file.name.includes(".")
    ? file.name.slice(file.name.lastIndexOf(".") + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
    : isImage
      ? "jpg"
      : "mp4"
  const publicId = randomId()
  const fileName = `${publicId}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const saved = await saveFile(kind, fileName, buffer)

  return NextResponse.json({
    secure_url: saved.url,
    url: saved.url,
    public_id: publicId,
  })
}
