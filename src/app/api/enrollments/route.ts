import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ enrollments: [] })
    }

    const enrollments = await prisma.enrollment.findMany({
      where: { userId: session.user.id },
      select: { courseId: true, progress: true },
    })

    return NextResponse.json({ enrollments })
  } catch (error) {
    console.error("Failed to fetch enrollments:", error)
    return NextResponse.json({ enrollments: [] })
  }
}
