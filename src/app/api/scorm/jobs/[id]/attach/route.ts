import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { assertCourseEditable, PUBLISHED_EDIT_BLOCKED } from "@/lib/course-edit-guard"
import { approveAiInteraction } from "@/lib/ai/assist"
import { assertCourseSection, canUseStudio } from "@/lib/scorm/authz"
import type { ScormDesign } from "@/lib/scorm/types"

export const runtime = "nodejs"

const schema = z.object({
  courseId: z.string().min(1),
  sectionId: z.string().min(1),
})

/**
 * POST /api/scorm/jobs/[id]/attach — create a SCORM lecture from a
 * succeeded job. Attaching counts as the author's approval of the AI
 * draft (spec §8.1), so the linked AiInteraction is marked approved.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })

  const job = await prisma.scormBuildJob.findUnique({ where: { id } })
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (job.userId !== session.user.id && !canUseStudio(session, job.academyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (job.status !== "SUCCEEDED" || !job.packageUrl) {
    return NextResponse.json({ error: "Job has not produced a package yet" }, { status: 409 })
  }

  const check = await assertCourseSection(session, parsed.data.courseId, parsed.data.sectionId)
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  const editable = await assertCourseEditable(parsed.data.courseId)
  if (editable.blocked) return NextResponse.json(PUBLISHED_EDIT_BLOCKED, { status: 409 })

  const design = (job.designJson ?? null) as ScormDesign | null
  const last = await prisma.lecture.findFirst({
    where: { sectionId: parsed.data.sectionId },
    orderBy: { position: "desc" },
    select: { position: true },
  })
  const lecture = await prisma.lecture.create({
    data: {
      title: design?.title ?? job.title,
      description: design?.lead ?? job.description ?? null,
      type: "SCORM",
      position: (last?.position ?? -1) + 1,
      sectionId: parsed.data.sectionId,
      videoDuration: job.videoDurationSeconds,
      contentPayloadJson: {
        packageUrl: job.packageUrl,
        entryPoint: job.entryPoint ?? "index.html",
        manifest: "imsmanifest.xml",
        version: "SCORM_1_2",
        scormBuildJobId: job.id,
      },
    },
  })

  await prisma.scormBuildJob.update({
    where: { id: job.id },
    data: { lectureId: lecture.id, courseId: parsed.data.courseId, sectionId: parsed.data.sectionId },
  })

  // Approve the AI draft that produced this design (if any).
  const interactions = await prisma.aiInteraction.findMany({
    where: { academyId: job.academyId, capability: "SCORM_DESIGN", approved: false, contextJson: { path: ["scormBuildJobId"], equals: job.id } },
    select: { id: true },
  })
  for (const i of interactions) await approveAiInteraction(i.id, session.user.id)

  await audit({
    action: "lecture.create",
    resourceType: "lecture",
    resourceId: lecture.id,
    userId: session.user.id,
    academyId: job.academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: { courseId: parsed.data.courseId, sectionId: parsed.data.sectionId, type: "SCORM", source: "scorm-studio", jobId: job.id },
  })

  return NextResponse.json({ data: { lectureId: lecture.id, courseId: parsed.data.courseId } }, { status: 201 })
}
