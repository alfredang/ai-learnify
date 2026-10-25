import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit, getRequestIp } from "@/lib/audit"
import { saveFile, sanitizeFileName } from "@/lib/storage"
import { runScormVideoAgent, SCORM_VIDEO_DIR } from "@/lib/ai/harness/scorm-video-agent"
import { assertCourseSection, canUseStudio, resolveStudioAcademyId } from "@/lib/scorm/authz"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_VIDEO_BYTES = 500 * 1024 * 1024
const ALLOWED = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"])

const fieldsSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional().default(""),
  audience: z.string().max(300).optional().default(""),
  transcript: z.string().max(60_000).optional().default(""),
  topicCount: z.coerce.number().int().min(1).max(10).default(4),
  questionCount: z.coerce.number().int().min(1).max(20).default(5),
  passMark: z.coerce.number().int().min(1).max(100).default(80),
  academyId: z.string().optional(),
  courseId: z.string().optional(),
  sectionId: z.string().optional(),
})

/**
 * POST /api/scorm/jobs — multipart: `video` file + design fields.
 * Stores the video, creates a ScormBuildJob and starts the harness in
 * the background. Clients poll GET /api/scorm/jobs/[id] for progress.
 */
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await request.formData()
  const video = form.get("video")
  if (!(video instanceof File)) {
    return NextResponse.json({ error: "Missing 'video' file", code: "BAD_REQUEST" }, { status: 400 })
  }
  if (!ALLOWED.has(video.type) && !/\.(mp4|m4v|webm|mov)$/i.test(video.name)) {
    return NextResponse.json({ error: `Unsupported video type: ${video.type || video.name}`, code: "UNSUPPORTED_TYPE" }, { status: 400 })
  }
  if (video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video larger than 500MB", code: "FILE_TOO_LARGE" }, { status: 413 })
  }

  const raw: Record<string, string> = {}
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v
  const parsed = fieldsSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
  }
  const input = parsed.data

  const academyId = await resolveStudioAcademyId(session, input.academyId ?? null, input.courseId ?? null)
  if (!academyId || !canUseStudio(session, academyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  if (input.courseId || input.sectionId) {
    if (!input.courseId || !input.sectionId) {
      return NextResponse.json({ error: "courseId and sectionId must be supplied together" }, { status: 400 })
    }
    const check = await assertCourseSection(session, input.courseId, input.sectionId)
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status })
  }

  const job = await prisma.scormBuildJob.create({
    data: {
      academyId,
      userId: session.user.id,
      courseId: input.courseId ?? null,
      sectionId: input.sectionId ?? null,
      title: input.title,
      description: input.description || null,
      audience: input.audience || null,
      transcript: input.transcript || null,
      topicCount: input.topicCount,
      questionCount: input.questionCount,
      passMark: input.passMark,
      status: "QUEUED",
    },
  })

  // Store the video inside the package folder so the publish step only
  // has to add the generated files next to it.
  const ext = (video.name.match(/\.([a-z0-9]+)$/i)?.[1] ?? "mp4").toLowerCase()
  const fileName = sanitizeFileName(`lesson-video.${ext}`)
  const buffer = Buffer.from(await video.arrayBuffer())
  const saved = await saveFile(SCORM_VIDEO_DIR, fileName, buffer, `${job.id}/media`)

  await prisma.scormBuildJob.update({
    where: { id: job.id },
    data: { videoFileName: fileName, videoBytes: buffer.length, videoUrl: saved.url },
  })

  await audit({
    action: "scorm.build.started",
    resourceType: "scormBuildJob",
    resourceId: job.id,
    userId: session.user.id,
    academyId,
    ip: getRequestIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
    metadata: { title: input.title, bytes: buffer.length, courseId: input.courseId ?? null },
  })

  // Fire-and-forget: the harness persists every step on the job row.
  void runScormVideoAgent(job.id).catch((e) => {
    console.error("[scorm-studio] harness crashed", { jobId: job.id, error: e instanceof Error ? e.message : e })
  })

  return NextResponse.json({ data: { id: job.id, status: "QUEUED" } }, { status: 202 })
}

/** GET /api/scorm/jobs — the caller's recent jobs. */
export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const url = new URL(request.url)
  const academyId = url.searchParams.get("academyId")
  const jobs = await prisma.scormBuildJob.findMany({
    where: { userId: session.user.id, ...(academyId ? { academyId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      status: true,
      currentStep: true,
      packageUrl: true,
      zipUrl: true,
      lectureId: true,
      courseId: true,
      model: true,
      createdAt: true,
      completedAt: true,
      errorMessage: true,
    },
  })
  return NextResponse.json({ data: jobs })
}
