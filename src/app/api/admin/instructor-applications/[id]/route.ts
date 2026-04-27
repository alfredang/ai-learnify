import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { reviewApplicationSchema } from "@/lib/validations/user"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden", code: "ROLE_FORBIDDEN" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const validatedData = reviewApplicationSchema.safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          code: "VALIDATION_ERROR",
          issues: validatedData.error.issues,
        },
        { status: 400 }
      )
    }

    const application = await prisma.instructorApplication.findUnique({
      where: { id },
    })

    if (!application) {
      return NextResponse.json(
        { error: "Application not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    if (application.status !== "PENDING") {
      return NextResponse.json(
        { error: "Application already reviewed", code: "ALREADY_REVIEWED" },
        { status: 400 }
      )
    }

    const { status, adminNote } = validatedData.data

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.instructorApplication.update({
        where: { id },
        data: {
          status,
          adminNote,
          reviewedById: session.user.id,
          reviewedAt: new Date(),
        },
      })

      if (status === "APPROVED") {
        await tx.user.update({
          where: { id: application.userId },
          data: {
            role: "INSTRUCTOR",
            headline: application.headline,
            bio: application.bio,
          },
        })
      }

      return updated
    })

    return NextResponse.json({ application: result })
  } catch (error) {
    console.error("[ADMIN_APPLICATION_PATCH]", error)
    return NextResponse.json(
      { error: "Failed to review application", code: "REVIEW_FAILED" },
      { status: 500 }
    )
  }
}
