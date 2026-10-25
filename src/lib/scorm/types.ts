import { z } from "zod"

/**
 * Learning design for a video-centred SCORM 1.2 module. Produced by the
 * SCORM_DESIGN capability (OpenAI → DeepSeek) or by the deterministic
 * template fallback, then rendered into a self-contained SCO.
 */

const questionBase = {
  question: z.string().min(5).max(500),
  options: z.array(z.string().min(1).max(300)).length(4),
  answer: z.number().int().min(0).max(3),
}

export const knowledgeCheckSchema = z.object({
  ...questionBase,
  good: z.string().min(1).max(400),
  bad: z.string().min(1).max(400),
})

export const topicSchema = z.object({
  title: z.string().min(2).max(200),
  lead: z.string().min(1).max(600),
  tiles: z
    .array(z.object({ heading: z.string().min(1).max(80), body: z.string().min(1).max(300) }))
    .min(2)
    .max(6),
  bodyHtml: z.string().max(4000).default(""),
  check: knowledgeCheckSchema,
})

export const examQuestionSchema = z.object(questionBase)

export const scormDesignSchema = z.object({
  title: z.string().min(2).max(200),
  subtitle: z.string().max(200).default(""),
  lead: z.string().min(1).max(800),
  learningOutcomes: z.array(z.string().min(3).max(300)).min(2).max(8),
  videoTitle: z.string().min(1).max(200),
  videoIntro: z.string().max(600).default(""),
  topics: z.array(topicSchema).min(1).max(10),
  exam: z.array(examQuestionSchema).min(1).max(20),
  passMark: z.number().int().min(1).max(100).default(80),
})

export type ScormDesign = z.infer<typeof scormDesignSchema>
export type ScormTopic = z.infer<typeof topicSchema>

/** A file inside a SCORM package, keyed by its package-relative path. */
export type PackageFile = {
  path: string
  data: Buffer | string
}

export type ValidationCheck = {
  id: string
  label: string
  status: "pass" | "warn" | "fail"
  detail?: string
}

export type ValidationReport = {
  ok: boolean
  version: "SCORM_1_2"
  checks: ValidationCheck[]
  summary: { pass: number; warn: number; fail: number }
  manifestIdentifier: string | null
  launchFile: string | null
}
