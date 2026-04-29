import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { put } from "@vercel/blob"
import { auth } from "@/lib/auth"

// Demo upload route used when Cloudinary isn't configured. Writes to:
//   - Vercel Blob if BLOB_READ_WRITE_TOKEN is set (production-friendly)
//   - /public/uploads on disk otherwise (dev / non-Vercel)
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
const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100MB

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
  const isAcademyAdmin = (session.user.memberships ?? []).some(
    (m) => m.role === "ACADEMY_ADMIN"
  )
  if (!legacyAllowed && !isPlatformOwner && !isAcademyAdmin) {
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
  const publicId = randomBytes(8).toString("hex")
  const fileName = `${publicId}.${ext}`

  // Vercel Blob path — used whenever the token is set (production on
  // Vercel, or any env that enabled Blob via vercel link). Survives
  // redeploys, no filesystem writes needed.
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`uploads/${kind}/${fileName}`, file, {
      access: "public",
      addRandomSuffix: false,
    })
    return NextResponse.json({
      secure_url: blob.url,
      url: blob.url,
      public_id: publicId,
    })
  }

  // Local disk path — dev only. Vercel without Blob configured falls
  // through to here and the writeFile fails with EROFS, which we surface
  // with a clear message instead of a stack trace.
  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        error:
          "Uploads aren't configured on this Vercel deployment. Connect Vercel Blob in the dashboard (Storage → Create → Blob) or set CLOUDINARY_* env vars.",
        code: "BLOB_NOT_CONFIGURED",
      },
      { status: 503 }
    )
  }

  const dir = path.join(process.cwd(), "public", "uploads", kind)
  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, fileName), buffer)

  const url = `/uploads/${kind}/${fileName}`
  return NextResponse.json({
    secure_url: url,
    url,
    public_id: publicId,
  })
}
