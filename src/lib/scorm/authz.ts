import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"

/**
 * Shared authorisation for SCORM Studio routes.
 *
 * A user may build packages for an academy when they are the Platform
 * Owner, or hold an ACADEMY_ADMIN / COURSE_DEVELOPER membership there
 * (legacy INSTRUCTOR/ADMIN roles are honoured for seed accounts).
 */
export function canUseStudio(session: Session | null, academyId: string): boolean {
  if (!session?.user) return false
  if (session.user.platformRole === "PLATFORM_OWNER") return true
  if (session.user.role === "ADMIN") return true
  const roles = new Set(["ACADEMY_ADMIN", "COURSE_DEVELOPER"])
  return Boolean(session.user.memberships?.some((m) => m.academyId === academyId && roles.has(m.role)))
}

/** Resolve the academy to build under for the signed-in author. */
export async function resolveStudioAcademyId(
  session: Session,
  preferred?: string | null,
  courseId?: string | null
): Promise<string | null> {
  if (courseId) {
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { academyId: true } })
    if (course?.academyId) return course.academyId
  }
  if (preferred) return preferred
  const staff = session.user.memberships?.find((m) => m.role === "COURSE_DEVELOPER" || m.role === "ACADEMY_ADMIN")
  if (staff) return staff.academyId
  if (session.user.platformRole === "PLATFORM_OWNER" || session.user.role === "ADMIN" || session.user.role === "INSTRUCTOR") {
    const a = await prisma.academy.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } })
    return a?.id ?? null
  }
  return null
}

/** Verify the author may add lectures to the given course/section. */
export async function assertCourseSection(session: Session, courseId: string, sectionId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, instructorId: true, academyId: true, status: true },
  })
  if (!course) return { ok: false as const, status: 404, error: "Course not found" }
  const owns = course.instructorId === session.user.id
  const isAdmin = session.user.role === "ADMIN" || session.user.platformRole === "PLATFORM_OWNER"
  const isAcademyAdmin = Boolean(
    course.academyId &&
      session.user.memberships?.some((m) => m.academyId === course.academyId && m.role === "ACADEMY_ADMIN")
  )
  if (!owns && !isAdmin && !isAcademyAdmin) return { ok: false as const, status: 403, error: "You do not own this course" }
  const section = await prisma.section.findFirst({ where: { id: sectionId, courseId }, select: { id: true } })
  if (!section) return { ok: false as const, status: 404, error: "Section not found" }
  return { ok: true as const, course }
}
