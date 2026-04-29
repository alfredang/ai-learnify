import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

// Client-direct upload to Vercel Blob. The browser hits this route to get
// a short-lived upload token, then PUTs the file directly to Blob storage,
// bypassing Vercel's 4.5MB serverless function body cap. Required for any
// upload larger than a few MB on the live site.
//
// Requires BLOB_READ_WRITE_TOKEN in env — set by enabling Blob storage in
// the Vercel project dashboard (Storage → Create → Blob).
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
  const isCourseDeveloper = (session.user.memberships ?? []).some(
    (m) => m.role === "COURSE_DEVELOPER"
  )
  if (!legacyAllowed && !isPlatformOwner && !isAcademyAdmin && !isCourseDeveloper) {
    return NextResponse.json(
      { error: "You do not have permission to upload files", code: "ROLE_FORBIDDEN" },
      { status: 403 }
    )
  }

  const body = (await request.json()) as HandleUploadBody

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/webp",
            "video/mp4",
            "video/webm",
            "video/quicktime",
          ],
          addRandomSuffix: true,
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB hard cap
        }
      },
      onUploadCompleted: async () => {
        // No persistence here — components store the URL directly on the
        // course / lecture they belong to via the existing PUT routes.
      },
    })
    return NextResponse.json(jsonResponse)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed"
    // Most common: BLOB_READ_WRITE_TOKEN missing. Surface a clear code so
    // the client can fall back to the local-disk route (dev).
    const isMissingToken =
      message.toLowerCase().includes("token") ||
      message.toLowerCase().includes("blob_read_write_token")
    return NextResponse.json(
      {
        error: message,
        code: isMissingToken ? "BLOB_NOT_CONFIGURED" : "BLOB_UPLOAD_FAILED",
      },
      { status: isMissingToken ? 503 : 400 }
    )
  }
}
