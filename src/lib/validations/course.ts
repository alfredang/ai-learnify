import { z } from "zod"

export const courseCreateSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(60, "Title must be less than 60 characters"),
  categoryId: z.string().min(1, "Please select a category"),
})

export type CourseCreateInput = z.infer<typeof courseCreateSchema>

export const courseSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(100, "Title must be less than 100 characters"),
  subtitle: z
    .string()
    .max(120, "Subtitle must be less than 120 characters")
    .optional(),
  description: z.string().optional(),
  categoryId: z.string().min(1, "Please select a category"),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ALL_LEVELS"]),
  language: z.string().default("English"),
  price: z.coerce.number().min(0, "Price must be 0 or greater"),
  // Phase 9 — Spec §18 multi-currency. ISO 4217. Uppercase at save time.
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO code")
    .optional(),
  isFree: z.boolean().default(false),
  learningOutcomes: z.array(z.string()).optional(),
  requirements: z.array(z.string()).optional(),
  targetAudience: z.array(z.string()).optional(),
  // Assessment rules — spec §7.3
  assessmentPassMark: z.coerce
    .number()
    .int()
    .min(50, "Pass mark must be at least 50%")
    .max(100, "Pass mark cannot exceed 100%")
    .optional(),
  // -1 = unlimited retakes (default), 0 = no retakes, N = N retakes allowed.
  retakesAllowed: z.coerce.number().int().min(-1).optional(),
  // Spec §13 — CPD entry attached to the course. Snapshotted onto the
  // certificate at issue time. Empty string is normalised to null in the
  // PUT handler so authors can clear the selection.
  cpdCatalogId: z.string().nullable().optional(),
})

export const sectionSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z.string().optional(),
})

// Per-type content payload schemas. The DB column is Json (loose), but the
// API and editors enforce these shapes so authors don't ship invalid lectures.
export const pdfPayloadSchema = z.object({
  pdfUrl: z.string().url("PDF URL must be a valid URL"),
})

export const scormPayloadSchema = z.object({
  packageUrl: z.string().url("SCORM package URL must be a valid URL"),
  entryPoint: z.string().optional(),
  manifest: z.string().optional(),
  version: z.enum(["SCORM_1_2", "SCORM_2004"]).default("SCORM_1_2"),
})

export const xapiPayloadSchema = z.object({
  launchUrl: z.string().url("xAPI launch URL must be a valid URL"),
  activityId: z.string().optional(),
})

export const voiceOverSlidesPayloadSchema = z.object({
  pdfUrl: z.string().url("Slides PDF URL must be a valid URL"),
  slides: z
    .array(
      z.object({
        page: z.number().int().min(1, "Page must be 1 or greater"),
        voText: z.string(),
      })
    )
    .default([]),
})

export const downloadablePayloadSchema = z.object({
  files: z
    .array(
      z.object({
        name: z.string().min(1, "File name is required"),
        url: z.string().url("File URL must be a valid URL"),
        sizeBytes: z.number().int().min(0).optional(),
      })
    )
    .min(1, "At least one downloadable file is required"),
})

export const htmlPayloadSchema = z.object({
  html: z.string().min(1, "HTML content is required"),
})

export const lectureSchema = z.object({
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(100, "Title must be less than 100 characters"),
  description: z.string().nullish(),
  // Phase 6 — Spec §7.1 content types. HTML added in authoring tool pass.
  type: z.enum([
    "VIDEO",
    "TEXT",
    "QUIZ",
    "PDF",
    "SCORM",
    "XAPI",
    "VOICE_OVER_SLIDES",
    "DOWNLOADABLE",
    "HTML",
  ]),
  content: z.string().nullish(),
  contentPayloadJson: z.record(z.string(), z.unknown()).nullish(),
  videoUrl: z.string().nullish(),
  videoPublicId: z.string().nullish(),
  videoDuration: z.coerce.number().nullish(),
  isFreePreview: z.boolean().default(false),
})

export const reviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000, "Review must be less than 1000 characters").optional(),
})

export const quizOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1, "Option text is required"),
  isCorrect: z.boolean(),
  // Used by drag_drop — zero-based target position. Required on that type.
  correctOrder: z.number().int().min(0).optional(),
})

export const quizQuestionSchema = z
  .object({
    id: z.string().min(1),
    // Spec §7.3 — auto-graded types. `open_ended` is accepted for
    // completion but isn't graded; `true_false` / `drag_drop` added per
    // spec §7.3 + Author Step 5.
    type: z.enum([
      "multiple_choice",
      "multiple_select",
      "open_ended",
      "true_false",
      "drag_drop",
    ]),
    text: z.string().min(1, "Question text is required"),
    options: z.array(quizOptionSchema),
    explanation: z.string().optional(),
    points: z.number().min(1).default(1),
  })
  .superRefine((question, ctx) => {
    if (question.type === "multiple_choice") {
      if (question.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Multiple choice must have at least 2 options",
          path: ["options"],
        })
      }
      const correctCount = question.options.filter((o) => o.isCorrect).length
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Multiple choice must have exactly 1 correct answer",
          path: ["options"],
        })
      }
    }
    if (question.type === "multiple_select") {
      if (question.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Multiple select must have at least 2 options",
          path: ["options"],
        })
      }
      if (!question.options.some((o) => o.isCorrect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Multiple select must have at least 1 correct answer",
          path: ["options"],
        })
      }
    }
    if (question.type === "true_false") {
      if (question.options.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "True/False must have exactly 2 options (True and False)",
          path: ["options"],
        })
      }
      const correctCount = question.options.filter((o) => o.isCorrect).length
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "True/False must have exactly 1 correct answer",
          path: ["options"],
        })
      }
    }
    if (question.type === "drag_drop") {
      if (question.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Drag-and-drop must have at least 2 items to order",
          path: ["options"],
        })
      }
      const orders = question.options.map((o) => o.correctOrder)
      if (orders.some((n) => n === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Every drag-and-drop item must have correctOrder set",
          path: ["options"],
        })
      }
      const seen = new Set<number>()
      for (const n of orders) {
        if (n === undefined) continue
        if (seen.has(n)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Drag-and-drop correctOrder values must be unique",
            path: ["options"],
          })
          break
        }
        seen.add(n)
      }
    }
  })

export const quizDataSchema = z.object({
  version: z.literal(1),
  passingScore: z.number().min(0).max(100).optional(),
  questions: z
    .array(quizQuestionSchema)
    .min(1, "Quiz must have at least 1 question"),
})

export type CourseInput = z.infer<typeof courseSchema>
export type SectionInput = z.infer<typeof sectionSchema>
export type LectureInput = z.infer<typeof lectureSchema>
export type ReviewInput = z.infer<typeof reviewSchema>
export type QuizDataInput = z.infer<typeof quizDataSchema>
