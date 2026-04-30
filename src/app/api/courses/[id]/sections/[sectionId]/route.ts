import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sectionSchema } from "@/lib/validations/course"
import { audit, getRequestIp } from "@/lib/audit"
import { assertCourseEditable, PUBLISHED_EDIT_BLOCKED } from "@/lib/course-edit-guard"

async function verifyCourseOwner(courseId: string, userId: string, role: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { instructorId: true },
  })

  if (!course) return { error: "Course not found", code: "COURSE_NOT_FOUND", status: 404 }
  if (course.instructorId !== userId && role !== "ADMIN") {
    return { error: "You do not own this course", code: "NOT_COURSE_OWNER", status: 403 }
  }
  return null
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id: courseId, sectionId } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const ownerCheck = await verifyCourseOwner(courseId, session.user.id, session.user.role)
    if (ownerCheck) {
      return NextResponse.json(
        { error: ownerCheck.error, code: ownerCheck.code },
        { status: ownerCheck.status }
      )
    }

    const editable = await assertCourseEditable(courseId)
    if (editable.blocked) {
      return NextResponse.json(PUBLISHED_EDIT_BLOCKED, { status: 409 })
    }

    const existing = await prisma.section.findUnique({
      where: { id: sectionId, courseId },
    })

    if (!existing) {
      return NextResponse.json(
        { error: "Section not found", code: "SECTION_NOT_FOUND" },
        { status: 404 }
      )
    }

    const body = await request.json()
    const validated = sectionSchema.partial().safeParse(body)

    if (!validated.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", issues: validated.error.issues },
        { status: 400 }
      )
    }

    const section = await prisma.section.update({
      where: { id: sectionId },
      data: validated.data,
      include: { lectures: { orderBy: { position: "asc" } } },
    })

    await audit({
      action: "section.update",
      resourceType: "section",
      resourceId: sectionId,
      userId: session.user.id,
      metadata: { courseId, fields: Object.keys(validated.data) },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({ section })
  } catch (error) {
    console.error("[SECTION_PUT]", error)
    return NextResponse.json(
      { error: "Failed to update section", code: "SECTION_UPDATE_FAILED" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; sectionId: string }> }
) {
  try {
    const { id: courseId, sectionId } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const ownerCheck = await verifyCourseOwner(courseId, session.user.id, session.user.role)
    if (ownerCheck) {
      return NextResponse.json(
        { error: ownerCheck.error, code: ownerCheck.code },
        { status: ownerCheck.status }
      )
    }

    const editable = await assertCourseEditable(courseId)
    if (editable.blocked) {
      return NextResponse.json(PUBLISHED_EDIT_BLOCKED, { status: 409 })
    }

    const section = await prisma.section.findUnique({
      where: { id: sectionId, courseId },
      select: { position: true },
    })

    if (!section) {
      return NextResponse.json(
        { error: "Section not found", code: "SECTION_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Delete the section (lectures cascade via onDelete: Cascade)
    await prisma.section.delete({ where: { id: sectionId } })

    // Reposition remaining sections to close the gap
    await prisma.section.updateMany({
      where: { courseId, position: { gt: section.position } },
      data: { position: { decrement: 1 } },
    })

    await audit({
      action: "section.delete",
      resourceType: "section",
      resourceId: sectionId,
      userId: session.user.id,
      metadata: { courseId },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({ message: "Section deleted successfully" })
  } catch (error) {
    console.error("[SECTION_DELETE]", error)
    return NextResponse.json(
      { error: "Failed to delete section", code: "SECTION_DELETE_FAILED" },
      { status: 500 }
    )
  }
}
