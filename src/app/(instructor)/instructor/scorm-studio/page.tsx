import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { resolveStudioAcademyId } from "@/lib/scorm/authz"
import { ScormStudio } from "./scorm-studio"

export const metadata: Metadata = {
  title: "SCORM Studio",
  description: "Turn a lecture video into a validated SCORM 1.2 package with AI",
}

export default async function ScormStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; sectionId?: string }>
}) {
  const session = await auth()
  if (!session?.user) redirect("/login?callbackUrl=/instructor/scorm-studio")
  const { courseId, sectionId } = await searchParams

  const isAdmin = session.user.role === "ADMIN" || session.user.platformRole === "PLATFORM_OWNER"
  const courses = await prisma.course.findMany({
    where: isAdmin ? {} : { instructorId: session.user.id },
    select: {
      id: true,
      title: true,
      status: true,
      academyId: true,
      sections: { select: { id: true, title: true, position: true }, orderBy: { position: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  })

  const academyId = await resolveStudioAcademyId(session, null, courseId ?? null)

  const academy = academyId
    ? await prisma.academy.findUnique({ where: { id: academyId }, select: { name: true, aiEnabled: true } })
    : null

  return (
    <ScormStudio
      academyId={academyId}
      academyName={academy?.name ?? null}
      aiEnabled={academy?.aiEnabled ?? false}
      courses={courses.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        sections: c.sections.map((s) => ({ id: s.id, title: s.title })),
      }))}
      initialCourseId={courseId ?? null}
      initialSectionId={sectionId ?? null}
    />
  )
}
