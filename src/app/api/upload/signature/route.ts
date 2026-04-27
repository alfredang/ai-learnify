import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  generateUploadSignature,
  CloudinaryNotConfiguredError,
} from "@/lib/cloudinary"

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only instructors can upload files", code: "ROLE_FORBIDDEN" },
        { status: 403 }
      )
    }

    const signatureData = generateUploadSignature()

    return NextResponse.json(signatureData)
  } catch (error) {
    if (error instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 503 }
      )
    }
    console.error("[UPLOAD_SIGNATURE_GET]", error)
    return NextResponse.json(
      { error: "Failed to generate upload signature", code: "SIGNATURE_FAILED" },
      { status: 500 }
    )
  }
}
