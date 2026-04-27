import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { ApplicationStatus } from "@prisma/client"

export async function GET(request: Request) {
  try {
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

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") as ApplicationStatus | null

    const applications = await prisma.instructorApplication.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    })

    return NextResponse.json({ applications })
  } catch (error) {
    console.error("[ADMIN_APPLICATIONS_GET]", error)
    return NextResponse.json(
      { error: "Failed to fetch applications", code: "FETCH_FAILED" },
      { status: 500 }
    )
  }
}
