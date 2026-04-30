import { prisma } from "@/lib/prisma"

/**
 * IESA spec §7.2 audit policy: once a course is PUBLISHED, content edits
 * must go through the unpublish → edit → submit-for-review → approve
 * cycle so each accepted change creates a CourseVersion snapshot. Direct
 * edits to a published course bypass the audit trail and are blocked.
 *
 * Status-only transitions (e.g., PUBLISHED → DRAFT to unpublish) are NOT
 * gated here — they're handled by the status-transition logic in the
 * course PUT handler.
 *
 * Returns a Response if the edit should be rejected, or null if allowed.
 */
export async function assertCourseEditable(
  courseId: string
): Promise<{ blocked: boolean; status: string | null }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { status: true },
  })
  if (!course) return { blocked: false, status: null }
  if (course.status === "PUBLISHED") {
    return { blocked: true, status: course.status }
  }
  return { blocked: false, status: course.status }
}

export const PUBLISHED_EDIT_BLOCKED = {
  error:
    "Course is published. Unpublish it first to edit, then resubmit for review.",
  code: "PUBLISHED_EDIT_BLOCKED" as const,
}
