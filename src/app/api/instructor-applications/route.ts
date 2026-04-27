import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { becomeInstructorSchema } from "@/lib/validations/user"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    const application = await prisma.instructorApplication.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ application })
  } catch (error) {
    console.error("[INSTRUCTOR_APPLICATION_GET]", error)
    return NextResponse.json(
      { error: "Failed to fetch application", code: "FETCH_FAILED" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      )
    }

    if (session.user.role !== "STUDENT") {
      return NextResponse.json(
        { error: "Only students can apply", code: "ROLE_FORBIDDEN" },
        { status: 403 }
      )
    }

    const existing = await prisma.instructorApplication.findFirst({
      where: { userId: session.user.id, status: "PENDING" },
    })

    if (existing) {
      return NextResponse.json(
        {
          error: "You already have a pending application",
          code: "ALREADY_PENDING",
        },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validatedData = becomeInstructorSchema.safeParse(body)

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

    const application = await prisma.instructorApplication.create({
      data: {
        userId: session.user.id,
        headline: validatedData.data.headline,
        bio: validatedData.data.bio,
      },
    })

    return NextResponse.json({ application }, { status: 201 })
  } catch (error) {
    console.error("[INSTRUCTOR_APPLICATION_POST]", error)
    return NextResponse.json(
      { error: "Failed to submit application", code: "CREATE_FAILED" },
      { status: 500 }
    )
  }
}
