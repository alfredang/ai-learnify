import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import type { Prisma, ScormBuildJob } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { runAiAssist } from "@/lib/ai/assist"
import { tryParseJson } from "@/lib/ai/agent"
import { runHarness, type StepDef, type StepTrace } from "@/lib/ai/harness/runner"
import { scormDesignSchema, type PackageFile, type ScormDesign, type ValidationReport } from "@/lib/scorm/types"
import { buildManifest, toIdentifier } from "@/lib/scorm/manifest"
import { renderSco, SCORM_API_JS } from "@/lib/scorm/sco-template"
import { validateScorm12Package } from "@/lib/scorm/validate"
import { zipPackage } from "@/lib/scorm/zip"
import { probeMp4 } from "@/lib/scorm/mp4"
import { publicUrlFor, resolveStoragePath, saveFile } from "@/lib/storage"
import { isR2Configured, r2PutObject } from "@/lib/object-storage"

/**
 * SCORM Studio agent — turns an uploaded lecture video into a validated
 * SCORM 1.2 package.
 *
 * Pipeline (each step is traced on the ScormBuildJob row):
 *   1. probe-video    — container/codec/duration via the MP4 box parser
 *   2. design         — SCORM_DESIGN capability (OpenAI gpt-6.1-sol →
 *                       DeepSeek fallback); self-repair pass if the JSON
 *                       fails schema validation; template fallback when
 *                       no provider is available
 *   3. review         — deterministic QA: counts, answer ranges, dedupe
 *   4. render         — SCO HTML + run-time wrapper from the design
 *   5. manifest       — imsmanifest.xml (ADL SCORM 1.2)
 *   6. validate       — SCORM 1.2 conformance report (hard-fails on error)
 *   7. publish        — write unpacked package + ZIP to storage
 *   8. attach         — optional: create a SCORM lecture in the course
 */

export const SCORM_VIDEO_DIR = "scorm"

type Ctx = {
  job: ScormBuildJob
  videoRel: string
  videoBuffer: Buffer
  videoFileName: string
  videoMime: string
  durationSeconds: number | null
  design: ScormDesign | null
  designSource: "openai" | "deepseek" | "template" | "mock" | null
  files: PackageFile[]
  validation: ValidationReport | null
  packageUrl: string | null
  zipUrl: string | null
  manifestIdentifier: string | null
  lectureId: string | null
}

function fmtDuration(seconds: number | null): string {
  if (!seconds) return "unknown"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

function buildDesignPrompt(job: ScormBuildJob, durationSeconds: number | null): string {
  const lines = [
    `Module title: ${job.title}`,
    job.description ? `Description: ${job.description}` : null,
    job.audience ? `Audience: ${job.audience}` : null,
    `Video duration: ${fmtDuration(durationSeconds)}`,
    `Topics required: ${job.topicCount}`,
    `Assessment questions required: ${job.questionCount}`,
    `Pass mark: ${job.passMark}%`,
    job.transcript ? `Transcript / speaker notes:\n${job.transcript.slice(0, 12_000)}` : "Transcript: not provided — derive topics from the title and description.",
    "",
    "Design the module now. Return ONLY the JSON object.",
  ]
  return lines.filter((l) => l !== null).join("\n")
}

/** Deterministic design used when no AI provider is reachable. */
export function buildTemplateDesign(job: ScormBuildJob): ScormDesign {
  const topic = job.title.trim() || "This module"
  const desc = (job.description ?? "").trim()
  const sentences = desc
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20)
  const n = Math.max(1, Math.min(10, job.topicCount))
  const q = Math.max(1, Math.min(20, job.questionCount))
  const themes = ["Why it matters", "Key principles", "Putting it into practice", "Common pitfalls", "Checking your understanding", "Next steps"]

  const topics = Array.from({ length: n }, (_, i) => {
    const theme = themes[i % themes.length]
    const seed = sentences[i % Math.max(1, sentences.length)] ?? `${topic} is introduced in the video lesson.`
    return {
      title: `Topic ${i + 1} — ${theme}`,
      lead: seed,
      tiles: [
        { heading: "Watch", body: `Revisit the part of the video that covers ${theme.toLowerCase()}.` },
        { heading: "Reflect", body: `How does this apply in your own role or workplace?` },
        { heading: "Apply", body: `Note one concrete action you will take based on this topic.` },
      ],
      bodyHtml: `<h3>Summary</h3><p>${seed.replace(/</g, "&lt;")}</p>`,
      check: {
        question: `Which statement best reflects the guidance in "${topic}" on ${theme.toLowerCase()}?`,
        options: [
          "Follow the approach demonstrated in the video and apply it consistently.",
          "Ignore the guidance unless a supervisor specifically asks for it.",
          "Apply it only when it is convenient to do so.",
          "Treat it as optional background information.",
        ],
        answer: 0,
        good: "Correct — consistent application is the point of the lesson.",
        bad: "The guidance should be applied consistently, as demonstrated in the video.",
      },
    }
  })

  const exam = Array.from({ length: q }, (_, i) => ({
    question: `Question ${i + 1}: according to the module "${topic}", what is the recommended practice?`,
    options: [
      "Apply the practice shown in the video consistently and report issues through the correct channel.",
      "Wait for problems to occur before taking any action.",
      "Rely on memory rather than the documented procedure.",
      "Skip the steps that seem time-consuming.",
    ],
    answer: 0,
  }))

  return {
    title: topic,
    subtitle: "Video-based learning module",
    lead: desc || `This module is built around the video lesson "${topic}". Watch the video, work through the topics and complete the assessment to finish.`,
    learningOutcomes: [
      `Explain the key ideas presented in "${topic}".`,
      "Apply the recommended practice in a realistic scenario.",
      "Identify common mistakes and how to avoid them.",
    ],
    videoTitle: topic,
    videoIntro: "Press play below. Watch the whole video to unlock the learning topics.",
    topics,
    exam,
    passMark: job.passMark,
  }
}

/** Normalise counts/ranges so the renderer and validator always get a consistent design. */
function reviewDesign(design: ScormDesign, job: ScormBuildJob, fallback: ScormDesign): { design: ScormDesign; notes: string[] } {
  const notes: string[] = []
  const d: ScormDesign = JSON.parse(JSON.stringify(design))

  if (d.topics.length > job.topicCount) {
    d.topics = d.topics.slice(0, job.topicCount)
    notes.push(`trimmed topics to ${job.topicCount}`)
  } else if (d.topics.length < job.topicCount) {
    const extra = fallback.topics.slice(d.topics.length, job.topicCount)
    d.topics.push(...extra)
    notes.push(`padded ${extra.length} topic(s) from template`)
  }
  if (d.exam.length > job.questionCount) {
    d.exam = d.exam.slice(0, job.questionCount)
    notes.push(`trimmed exam to ${job.questionCount}`)
  } else if (d.exam.length < job.questionCount) {
    const extra = fallback.exam.slice(d.exam.length, job.questionCount)
    d.exam.push(...extra)
    notes.push(`padded ${extra.length} exam question(s) from template`)
  }
  d.passMark = job.passMark

  const fixQuestion = (qq: { options: string[]; answer: number }, label: string) => {
    const unique = Array.from(new Set(qq.options.map((o) => o.trim())))
    if (unique.length < qq.options.length) notes.push(`${label}: duplicate options`)
    if (qq.answer < 0 || qq.answer >= qq.options.length) {
      qq.answer = 0
      notes.push(`${label}: answer index out of range — reset to 0`)
    }
  }
  d.topics.forEach((t, i) => fixQuestion(t.check, `topic ${i + 1} check`))
  d.exam.forEach((e, i) => fixQuestion(e, `exam q${i + 1}`))

  if (!d.videoTitle) d.videoTitle = d.title
  return { design: d, notes }
}

async function persistTrace(jobId: string, trace: StepTrace[], current: StepTrace) {
  await prisma.scormBuildJob.update({
    where: { id: jobId },
    data: {
      stepsJson: trace as unknown as Prisma.InputJsonValue,
      currentStep: current.status === "running" ? current.id : null,
    },
  })
}

function steps(): StepDef<Ctx>[] {
  return [
    {
      id: "probe-video",
      label: "Inspect uploaded video",
      async run(ctx) {
        const probe = probeMp4(ctx.videoBuffer)
        ctx.durationSeconds = probe.durationSeconds
        await prisma.scormBuildJob.update({
          where: { id: ctx.job.id },
          data: { videoDurationSeconds: probe.durationSeconds ? Math.round(probe.durationSeconds) : null },
        })
        const codec = probe.hasAvc1 ? "H.264" : probe.hasHevc ? "HEVC (may not play in all browsers)" : "unknown codec"
        return {
          status: "done",
          detail: probe.isMp4
            ? `MP4 ${probe.majorBrand ?? ""} · ${codec} · ${fmtDuration(probe.durationSeconds)} · ${(ctx.videoBuffer.length / 1024 / 1024).toFixed(1)} MB`
            : `Non-MP4 container (${ctx.videoMime}) · ${(ctx.videoBuffer.length / 1024 / 1024).toFixed(1)} MB`,
          data: { durationSeconds: probe.durationSeconds, h264: probe.hasAvc1, fastStart: probe.fastStart },
        }
      },
    },
    {
      id: "design",
      label: "Draft learning design with AI",
      async run(ctx, trace) {
        const prompt = buildDesignPrompt(ctx.job, ctx.durationSeconds)
        let rawText = ""
        let model = ""
        let interactionId: string | null = null
        try {
          const res = await runAiAssist({
            capability: "SCORM_DESIGN",
            academyId: ctx.job.academyId,
            userId: ctx.job.userId,
            userPrompt: prompt,
            context: { scormBuildJobId: ctx.job.id, courseId: ctx.job.courseId ?? undefined },
          })
          rawText = res.rawText
          model = res.usage.model
          interactionId = res.interactionId
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          ctx.design = buildTemplateDesign(ctx.job)
          ctx.designSource = "template"
          await prisma.scormBuildJob.update({ where: { id: ctx.job.id }, data: { model: "template" } })
          return { status: "done", detail: `AI unavailable (${msg.slice(0, 140)}) — used template design`, data: { source: "template" } }
        }

        let parsed = scormDesignSchema.safeParse(tryParseJson(rawText))
        if (!parsed.success) {
          // One self-repair round: hand the validation issues back to the model.
          trace.detail = "First draft failed schema validation — asking the model to repair"
          const issues = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
          try {
            const fix = await runAiAssist({
              capability: "SCORM_DESIGN",
              academyId: ctx.job.academyId,
              userId: ctx.job.userId,
              userPrompt: `${prompt}\n\nYour previous JSON failed validation with these issues: ${issues}\n\nPrevious JSON:\n${rawText.slice(0, 20_000)}\n\nReturn a corrected JSON object only.`,
              context: { scormBuildJobId: ctx.job.id, repair: true },
            })
            rawText = fix.rawText
            model = fix.usage.model
            interactionId = fix.interactionId
            parsed = scormDesignSchema.safeParse(tryParseJson(rawText))
          } catch {
            // fall through to template below
          }
        }

        const isMock = model.includes("mock")
        if (!parsed.success) {
          ctx.design = buildTemplateDesign(ctx.job)
          ctx.designSource = "template"
          await prisma.scormBuildJob.update({ where: { id: ctx.job.id }, data: { model: `${model || "none"}→template` } })
          return { status: "done", detail: "Model output did not validate after repair — used template design", data: { source: "template", interactionId } }
        }
        ctx.design = parsed.data
        ctx.designSource = isMock ? "mock" : model.startsWith("deepseek") ? "deepseek" : "openai"
        await prisma.scormBuildJob.update({ where: { id: ctx.job.id }, data: { model } })
        return {
          status: "done",
          detail: `${model} · ${parsed.data.topics.length} topics · ${parsed.data.exam.length} questions`,
          data: { source: ctx.designSource, model, interactionId },
        }
      },
    },
    {
      id: "review",
      label: "Review design for consistency",
      async run(ctx) {
        if (!ctx.design) throw new Error("No design to review")
        const { design, notes } = reviewDesign(ctx.design, ctx.job, buildTemplateDesign(ctx.job))
        ctx.design = design
        await prisma.scormBuildJob.update({
          where: { id: ctx.job.id },
          data: { designJson: design as unknown as Prisma.InputJsonValue },
        })
        return { status: "done", detail: notes.length ? notes.join("; ") : "No adjustments needed", data: { adjustments: notes.length } }
      },
    },
    {
      id: "render",
      label: "Render SCO (HTML + run-time wrapper)",
      async run(ctx) {
        if (!ctx.design) throw new Error("No design to render")
        const mediaPath = `media/${ctx.videoFileName}`
        const html = renderSco({
          design: ctx.design,
          videoFile: mediaPath,
          videoMime: ctx.videoMime,
          brand: "Learnify",
        })
        ctx.files = [
          { path: "index.html", data: html },
          { path: "scripts/scorm_api.js", data: SCORM_API_JS },
          { path: mediaPath, data: ctx.videoBuffer },
        ]
        return { status: "done", detail: `index.html (${(html.length / 1024).toFixed(1)} KB), scripts/scorm_api.js, ${mediaPath}` }
      },
    },
    {
      id: "manifest",
      label: "Write imsmanifest.xml (SCORM 1.2)",
      async run(ctx) {
        if (!ctx.design) throw new Error("No design")
        const identifier = `LEARNIFY-${toIdentifier(ctx.job.title).slice(0, 24)}-${ctx.job.id.slice(-6).toUpperCase()}`
        const manifest = buildManifest({
          identifier,
          title: ctx.design.title,
          launchFile: "index.html",
          files: ctx.files.map((f) => f.path),
          masteryScore: ctx.design.passMark,
        })
        ctx.files.unshift({ path: "imsmanifest.xml", data: manifest })
        ctx.manifestIdentifier = identifier
        return { status: "done", detail: identifier }
      },
    },
    {
      id: "validate",
      label: "Validate SCORM 1.2 conformance",
      async run(ctx) {
        const report = validateScorm12Package(ctx.files)
        ctx.validation = report
        await prisma.scormBuildJob.update({
          where: { id: ctx.job.id },
          data: { validationJson: report as unknown as Prisma.InputJsonValue, manifestIdentifier: ctx.manifestIdentifier },
        })
        const detail = `${report.summary.pass} passed · ${report.summary.warn} warnings · ${report.summary.fail} failed`
        if (!report.ok) {
          const failed = report.checks.filter((c) => c.status === "fail").map((c) => c.label).join("; ")
          throw new Error(`SCORM 1.2 validation failed — ${failed}`)
        }
        return { status: "done", detail, data: report.summary }
      },
    },
    {
      id: "publish",
      label: "Publish package and ZIP",
      async run(ctx) {
        const dir = ctx.job.id
        const mediaPath = `media/${ctx.videoFileName}`
        const zip = zipPackage(ctx.files) // self-contained: includes the video
        const zipName = `${toIdentifier(ctx.job.title).toLowerCase()}-scorm12.zip`
        const useR2 = isR2Configured()

        // Hosted copy: with R2, the SCO page stays on this origin (it must
        // reach window.API on the LMS frame) but streams the video from R2.
        let hostedFiles = ctx.files
        let r2VideoUrl: string | null = null
        if (useR2) {
          const videoUrl = await r2PutObject(`scorm/${dir}/${ctx.videoFileName}`, ctx.videoBuffer, ctx.videoMime)
          const hostedHtml = renderSco({
            design: ctx.design!,
            videoFile: videoUrl,
            videoMime: ctx.videoMime,
            brand: "Learnify",
          })
          r2VideoUrl = videoUrl
          hostedFiles = ctx.files
            .filter((f) => f.path !== mediaPath)
            .map((f) => (f.path === "index.html" ? { ...f, data: hostedHtml } : f))
        }

        for (const f of hostedFiles) {
          if (f.path === mediaPath) continue // already on disk (local mode)
          const sub = path.posix.dirname(f.path)
          const name = path.posix.basename(f.path)
          await saveFile(SCORM_VIDEO_DIR, name, typeof f.data === "string" ? Buffer.from(f.data, "utf8") : f.data, sub === "." ? dir : `${dir}/${sub}`)
        }

        if (useR2) {
          ctx.zipUrl = await r2PutObject(`scorm/${dir}/${zipName}`, zip, "application/zip")
          // Video now lives in R2 — free the VPS disk.
          await rm(resolveStoragePath(`${SCORM_VIDEO_DIR}/${dir}/media`), { recursive: true, force: true })
          await prisma.scormBuildJob.update({
            where: { id: ctx.job.id },
            data: { videoUrl: r2VideoUrl },
          })
        } else {
          ctx.zipUrl = (await saveFile(SCORM_VIDEO_DIR, zipName, zip, dir)).url
        }
        ctx.packageUrl = publicUrlFor(`${SCORM_VIDEO_DIR}/${dir}/`)
        await prisma.scormBuildJob.update({
          where: { id: ctx.job.id },
          data: { packageUrl: ctx.packageUrl, zipUrl: ctx.zipUrl, entryPoint: "index.html" },
        })
        return {
          status: "done",
          detail: `${zipName} (${(zip.length / 1024 / 1024).toFixed(1)} MB)${useR2 ? " · video + ZIP on Cloudflare R2" : ""}`,
          data: { packageUrl: ctx.packageUrl, zipUrl: ctx.zipUrl, storage: useR2 ? "r2" : "local" },
        }
      },
    },
    {
      id: "attach",
      label: "Attach as SCORM lecture",
      async run(ctx) {
        const { courseId, sectionId } = ctx.job
        if (!courseId || !sectionId) return { status: "skipped", detail: "No course/section selected — download or attach later" }
        const section = await prisma.section.findFirst({ where: { id: sectionId, courseId }, select: { id: true } })
        if (!section) return { status: "skipped", detail: "Section no longer exists" }
        const last = await prisma.lecture.findFirst({ where: { sectionId }, orderBy: { position: "desc" }, select: { position: true } })
        const lecture = await prisma.lecture.create({
          data: {
            title: ctx.design?.title ?? ctx.job.title,
            description: ctx.design?.lead ?? ctx.job.description ?? null,
            type: "SCORM",
            position: (last?.position ?? -1) + 1,
            sectionId,
            videoDuration: ctx.durationSeconds ? Math.round(ctx.durationSeconds) : null,
            contentPayloadJson: {
              packageUrl: ctx.packageUrl,
              entryPoint: "index.html",
              manifest: "imsmanifest.xml",
              version: "SCORM_1_2",
              scormBuildJobId: ctx.job.id,
            },
          },
        })
        ctx.lectureId = lecture.id
        await prisma.scormBuildJob.update({ where: { id: ctx.job.id }, data: { lectureId: lecture.id } })
        await audit({
          action: "lecture.create",
          resourceType: "lecture",
          resourceId: lecture.id,
          userId: ctx.job.userId,
          academyId: ctx.job.academyId,
          metadata: { courseId, sectionId, type: "SCORM", source: "scorm-studio", jobId: ctx.job.id },
        })
        return { status: "done", detail: `Lecture "${lecture.title}" added to the section`, data: { lectureId: lecture.id } }
      },
    },
  ]
}

/**
 * Run the full pipeline for a queued job. Safe to call fire-and-forget
 * from an API route — all state lands on the ScormBuildJob row.
 */
export async function runScormVideoAgent(jobId: string): Promise<void> {
  const job = await prisma.scormBuildJob.findUnique({ where: { id: jobId } })
  if (!job) throw new Error("Job not found")
  if (!job.videoUrl || !job.videoFileName) throw new Error("Job has no video")

  await prisma.scormBuildJob.update({ where: { id: jobId }, data: { status: "RUNNING", errorMessage: null } })

  const videoRel = `${SCORM_VIDEO_DIR}/${job.id}/media/${job.videoFileName}`
  const ext = path.extname(job.videoFileName).toLowerCase()
  const mime = ext === ".webm" ? "video/webm" : ext === ".mov" ? "video/quicktime" : "video/mp4"

  const ctx: Ctx = {
    job,
    videoRel,
    videoBuffer: await readFile(resolveStoragePath(videoRel)),
    videoFileName: job.videoFileName,
    videoMime: mime,
    durationSeconds: null,
    design: null,
    designSource: null,
    files: [],
    validation: null,
    packageUrl: null,
    zipUrl: null,
    manifestIdentifier: null,
    lectureId: null,
  }

  try {
    await runHarness(steps(), ctx, { onTrace: (trace, current) => persistTrace(job.id, trace, current) })
    await prisma.scormBuildJob.update({
      where: { id: jobId },
      data: { status: "SUCCEEDED", completedAt: new Date(), currentStep: null },
    })
    await audit({
      action: "scorm.build.succeeded",
      resourceType: "scormBuildJob",
      resourceId: jobId,
      userId: job.userId,
      academyId: job.academyId,
      metadata: {
        designSource: ctx.designSource,
        packageUrl: ctx.packageUrl,
        lectureId: ctx.lectureId,
        validation: ctx.validation?.summary,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await prisma.scormBuildJob.update({
      where: { id: jobId },
      data: { status: "FAILED", errorMessage: msg.slice(0, 2000), completedAt: new Date(), currentStep: null },
    })
    await audit({
      action: "scorm.build.failed",
      resourceType: "scormBuildJob",
      resourceId: jobId,
      userId: job.userId,
      academyId: job.academyId,
      metadata: { error: msg.slice(0, 500) },
    })
  }
}
