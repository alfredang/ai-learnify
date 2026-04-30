import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { courseSchema } from "@/lib/validations/course"
import {
  validateImageUrl,
  explainImageUrlReason,
} from "@/lib/image-hosts"
import { audit, getRequestIp } from "@/lib/audit"
import { loadRoleContext, hasAcademyRole, hasPlatformRole } from "@/lib/academy"
import slugify from "slugify"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        instructor: {
          select: { id: true, name: true, image: true, headline: true },
        },
        category: true,
        sections: {
          orderBy: { position: "asc" },
          include: {
            lectures: {
              orderBy: { position: "asc" },
            },
          },
        },
        survey: {
          select: { id: true, questionsJson: true },
        },
        _count: {
          select: { enrollments: true, reviews: true, versions: true },
        },
      },
    })

    if (!course) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        { status: 404 }
      )
    }

    // Only the course owner or admin can fetch via this endpoint
    if (
      course.instructorId !== session.user.id &&
      session.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "You do not own this course", code: "NOT_COURSE_OWNER" },
        { status: 403 }
      )
    }

    return NextResponse.json({ course })
  } catch (error) {
    console.error("[COURSE_ID_GET]", error)
    return NextResponse.json(
      { error: "Failed to fetch course", code: "COURSE_FETCH_FAILED" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only instructors can update courses", code: "ROLE_FORBIDDEN" },
        { status: 403 }
      )
    }

    const existingCourse = await prisma.course.findUnique({
      where: { id },
      select: {
        instructorId: true,
        slug: true,
        status: true,
        academyId: true,
        cpdCatalogId: true,
      },
    })

    if (!existingCourse) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        { status: 404 }
      )
    }

    if (
      existingCourse.instructorId !== session.user.id &&
      session.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "You do not own this course", code: "NOT_COURSE_OWNER" },
        { status: 403 }
      )
    }

    const body = await request.json()

    // Spec §7.2: edits to a PUBLISHED course are blocked. The developer
    // must unpublish first (status → DRAFT), edit, then resubmit. The
    // only thing allowed on a PUBLISHED course is a status transition.
    const bodyKeys = Object.keys(body)
    const isStatusOnlyChange =
      bodyKeys.length > 0 && bodyKeys.every((k) => k === "status")
    if (existingCourse.status === "PUBLISHED" && !isStatusOnlyChange) {
      const { PUBLISHED_EDIT_BLOCKED } = await import("@/lib/course-edit-guard")
      return NextResponse.json(PUBLISHED_EDIT_BLOCKED, { status: 409 })
    }

    // Spec §4 step 3 — status transitions are gated by role. Developers may
    // submit drafts for review and unpublish their own courses; only Academy
    // Admin (or Platform Owner) can flip PENDING_REVIEW → PUBLISHED.
    if (body.status && body.status !== existingCourse.status) {
      const ctx = await loadRoleContext(session.user.id)
      const isPlatformPrivileged = hasPlatformRole(ctx, "PLATFORM_OWNER", "PLATFORM_SUPPORT")
      const isAcademyAdmin =
        !!existingCourse.academyId &&
        hasAcademyRole(ctx, existingCourse.academyId, "ACADEMY_ADMIN")
      const isApprover = isPlatformPrivileged || isAcademyAdmin

      const from = existingCourse.status
      const to = body.status as string
      const developerAllowed: Record<string, string[]> = {
        DRAFT: ["PENDING_REVIEW", "ARCHIVED"],
        PENDING_REVIEW: ["DRAFT"], // withdraw submission
        PUBLISHED: ["DRAFT"], // unpublish
        REJECTED: ["DRAFT", "PENDING_REVIEW"],
      }
      const allowedForRole = isApprover ? null : developerAllowed[from] ?? []
      if (allowedForRole && !allowedForRole.includes(to)) {
        return NextResponse.json(
          {
            error:
              to === "PUBLISHED"
                ? "Only an Academy Admin can publish a course. Submit it for review instead."
                : `Transition ${from} → ${to} is not permitted for your role.`,
            code: "STATUS_TRANSITION_FORBIDDEN",
          },
          { status: 403 }
        )
      }
    }

    // Use partial validation — all fields optional for updates
    const validatedData = courseSchema.partial().safeParse(body)

    if (!validatedData.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          issues: validatedData.error.issues,
        },
        { status: 400 }
      )
    }

    const data = validatedData.data

    // Validate thumbnail URL host against the image allowlist. Same list
    // powers next/image's remotePatterns — keeping them in sync prevents
    // the "Invalid src prop, hostname not configured" runtime error from
    // saving and breaking the editor on next render.
    if (body.thumbnail !== undefined && body.thumbnail !== null && body.thumbnail !== "") {
      const v = validateImageUrl(body.thumbnail)
      if (!v.ok) {
        return NextResponse.json(
          {
            error: explainImageUrlReason(v.reason),
            code: "INVALID_IMAGE_HOST",
            field: "thumbnail",
          },
          { status: 400 }
        )
      }
    }

    // Spec §13 — CPD entry must belong to the same academy as the course
    // so a course can't reference a sibling tenant's catalog.
    let nextCpdCatalogId: string | null | undefined = undefined
    if ("cpdCatalogId" in data) {
      const raw = data.cpdCatalogId
      nextCpdCatalogId = raw === "" || raw == null ? null : raw
      if (nextCpdCatalogId && existingCourse.academyId) {
        const ok = await prisma.cpdCatalog.findFirst({
          where: { id: nextCpdCatalogId, academyId: existingCourse.academyId },
          select: { id: true },
        })
        if (!ok) {
          return NextResponse.json(
            {
              error: "Selected CPD entry does not belong to this academy",
              code: "INVALID_CPD",
              field: "cpdCatalogId",
            },
            { status: 400 }
          )
        }
      }
    }

    // Regenerate slug only if title changed
    let slug: string | undefined
    if (data.title) {
      slug = slugify(data.title, { lower: true, strict: true })
      if (slug !== existingCourse.slug) {
        const duplicateSlug = await prisma.course.findFirst({
          where: { slug, id: { not: id } },
        })
        if (duplicateSlug) {
          slug = `${slug}-${Date.now()}`
        }
      } else {
        slug = undefined
      }
    }

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(slug && { slug }),
        ...(data.subtitle !== undefined && { subtitle: data.subtitle }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.categoryId && { categoryId: data.categoryId }),
        ...(data.level && { level: data.level }),
        ...(data.language && { language: data.language }),
        ...(data.price !== undefined && {
          price: data.price,
          isFree: data.price === 0,
        }),
        ...(data.currency && { currency: data.currency.toUpperCase() }),
        ...(data.learningOutcomes && {
          learningOutcomes: data.learningOutcomes,
        }),
        ...(data.requirements && { requirements: data.requirements }),
        ...(data.targetAudience && { targetAudience: data.targetAudience }),
        ...(data.assessmentPassMark !== undefined && {
          assessmentPassMark: data.assessmentPassMark,
        }),
        ...(data.retakesAllowed !== undefined && {
          retakesAllowed: data.retakesAllowed,
        }),
        ...(nextCpdCatalogId !== undefined && {
          cpdCatalogId: nextCpdCatalogId,
        }),
        // These fields are outside the Zod schema but valid on the model
        ...(body.thumbnail !== undefined && { thumbnail: body.thumbnail }),
        ...(body.previewVideoUrl !== undefined && {
          previewVideoUrl: body.previewVideoUrl,
        }),
        ...(body.status && { status: body.status }),
        // Stamp publishedAt on first publish; clear rejectionReason once the
        // course leaves REJECTED so a stale message doesn't haunt the editor.
        ...(body.status === "PUBLISHED" &&
          existingCourse.status !== "PUBLISHED" && {
            publishedAt: new Date(),
            rejectionReason: null,
          }),
        ...(body.status &&
          body.status !== "REJECTED" &&
          existingCourse.status === "REJECTED" && { rejectionReason: null }),
      },
      include: {
        category: true,
        sections: {
          orderBy: { position: "asc" },
          include: {
            lectures: { orderBy: { position: "asc" } },
          },
        },
      },
    })

    const statusChanged = body.status && body.status !== existingCourse.status
    await audit({
      action: statusChanged
        ? `course.status.${String(body.status).toLowerCase()}`
        : "course.update",
      resourceType: "course",
      resourceId: id,
      userId: session.user.id,
      academyId: existingCourse.academyId ?? null,
      metadata: statusChanged
        ? { from: existingCourse.status, to: body.status }
        : { fields: Object.keys(data) },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    // Phase 6 — spec §7.2: snapshot on DRAFT → PUBLISHED transition.
    // Fire-and-forget so a snapshot failure doesn't block the publish
    // response; errors surface in logs + AuditLog.
    if (
      body.status === "PUBLISHED" &&
      existingCourse.status !== "PUBLISHED"
    ) {
      const { snapshotCourse } = await import("@/lib/course-versions")
      snapshotCourse(id, session.user.id).catch((err) => {
        console.error("[course.publish.snapshot] failed", {
          courseId: id,
          err: err instanceof Error ? err.message : String(err),
        })
      })
    }

    return NextResponse.json({ course })
  } catch (error) {
    console.error("[COURSE_ID_PUT]", error)
    return NextResponse.json(
      { error: "Failed to update course", code: "COURSE_UPDATE_FAILED" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()

    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_REQUIRED" },
        { status: 401 }
      )
    }

    if (session.user.role !== "INSTRUCTOR" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Only instructors can delete courses", code: "ROLE_FORBIDDEN" },
        { status: 403 }
      )
    }

    const course = await prisma.course.findUnique({
      where: { id },
      select: {
        instructorId: true,
        academyId: true,
        title: true,
        status: true,
        _count: { select: { enrollments: true } },
      },
    })

    if (!course) {
      return NextResponse.json(
        { error: "Course not found", code: "COURSE_NOT_FOUND" },
        { status: 404 }
      )
    }

    if (
      course.instructorId !== session.user.id &&
      session.user.role !== "ADMIN"
    ) {
      return NextResponse.json(
        { error: "You do not own this course", code: "NOT_COURSE_OWNER" },
        { status: 403 }
      )
    }

    // Spec §17 — soft-delete only. Even DRAFT courses link to AiInteraction,
    // CourseVersion, and (potentially) AccessGrant rows. Set status=ARCHIVED
    // and stamp deletedAt; never call prisma.course.delete().
    if (course.status === "ARCHIVED" && course._count.enrollments === 0) {
      // Already archived and unused — idempotent no-op.
    } else {
      await prisma.course.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          deletedAt: new Date(),
        },
      })
    }

    await audit({
      action: "course.archive",
      resourceType: "course",
      resourceId: id,
      userId: session.user.id,
      academyId: course.academyId ?? null,
      metadata: {
        title: course.title,
        priorStatus: course.status,
        enrollmentsAtArchive: course._count.enrollments,
      },
      ip: getRequestIp(request),
      userAgent: request.headers.get("user-agent") ?? undefined,
    })

    return NextResponse.json({
      message:
        course._count.enrollments > 0
          ? "Course archived. Existing learners retain access; the course is hidden from the public catalogue."
          : "Course archived. It is hidden from the public catalogue and can no longer be enrolled in.",
    })
  } catch (error) {
    console.error("[COURSE_ID_DELETE]", error)
    return NextResponse.json(
      { error: "Failed to delete course", code: "COURSE_DELETE_FAILED" },
      { status: 500 }
    )
  }
}
