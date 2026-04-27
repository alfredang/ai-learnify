import type { CourseVersion, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

/**
 * Phase 6 — Spec §7.2: snapshot the course at publish time.
 *
 * A CourseVersion freezes the full sections + lectures tree (plus key
 * course metadata) as a single JSON blob. Enrolled learners can be shown
 * the version active at purchase, regardless of later edits. For now we
 * always render the latest published version, but storing the history
 * unlocks that path when we want it.
 *
 * `snapshotCourse` is idempotent within a logical publish — calling it
 * repeatedly creates new rows with ascending versionNumber. Callers should
 * only invoke on DRAFT → PUBLISHED transitions (see the course PUT
 * handler) or when an Academy Admin explicitly re-publishes.
 */
export async function snapshotCourse(
  courseId: string,
  publisherUserId?: string
): Promise<CourseVersion> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      sections: {
        orderBy: { position: "asc" },
        include: {
          lectures: {
            orderBy: { position: "asc" },
          },
        },
      },
      survey: true,
    },
  })
  if (!course) throw new Error("Course not found")

  const last = await prisma.courseVersion.findFirst({
    where: { courseId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  })
  const versionNumber = (last?.versionNumber ?? 0) + 1

  // Full snapshot — we intentionally serialise everything the learner could
  // legitimately see so the version is self-contained. Prisma Decimal / Date
  // are serialised via JSON.parse(JSON.stringify(...)).
  const snapshot = JSON.parse(JSON.stringify(course)) as Prisma.InputJsonValue

  const version = await prisma.courseVersion.create({
    data: {
      courseId,
      versionNumber,
      snapshotJson: snapshot,
      publishedById: publisherUserId ?? null,
    },
  })

  await audit({
    action: "course.version.publish",
    resourceType: "course",
    resourceId: courseId,
    userId: publisherUserId,
    academyId: course.academyId,
    metadata: {
      versionNumber,
      versionId: version.id,
      sections: course.sections.length,
      lectures: course.sections.reduce((a, s) => a + s.lectures.length, 0),
    },
  })

  return version
}

export async function listCourseVersions(courseId: string) {
  return prisma.courseVersion.findMany({
    where: { courseId },
    orderBy: { versionNumber: "desc" },
    select: {
      id: true,
      versionNumber: true,
      publishedAt: true,
      publishedById: true,
      publishedBy: { select: { id: true, name: true, email: true } },
    },
    take: 100,
  })
}

export async function getCourseVersion(
  courseId: string,
  versionNumber: number
) {
  return prisma.courseVersion.findUnique({
    where: { courseId_versionNumber: { courseId, versionNumber } },
  })
}
