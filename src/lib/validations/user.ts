import { z } from "zod"

export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  headline: z.string().max(100, "Headline must be less than 100 characters").optional(),
  bio: z.string().max(1000, "Bio must be less than 1000 characters").optional(),
  website: z.string().url().optional().or(z.literal("")),
  twitter: z.string().max(50).optional(),
  linkedin: z.string().max(100).optional(),
  youtube: z.string().max(100).optional(),
  // Phase 8 / spec §3.1 — Learner identity fields printed on certificates.
  nameToBeCalled: z
    .string()
    .max(80, "Name to be called must be less than 80 characters")
    .optional()
    .or(z.literal("")),
  certificateName: z
    .string()
    .max(120, "Certificate name must be less than 120 characters")
    .optional()
    .or(z.literal("")),
  certificateIdNumber: z
    .string()
    .max(40, "ID number must be less than 40 characters")
    .optional()
    .or(z.literal("")),
  // Spec §3.2 — non-learner-only login identifier. Lowercased on save,
  // 3-32 chars, [a-z0-9_-]. Learners sending this are rejected at the
  // handler, not here.
  username: z
    .string()
    .regex(
      /^[a-z0-9_-]{3,32}$/,
      "Username must be 3-32 chars, lowercase letters, digits, dashes, underscores only"
    )
    .optional()
    .or(z.literal("")),
})

export const becomeInstructorSchema = z.object({
  headline: z
    .string()
    .min(10, "Headline must be at least 10 characters")
    .max(100, "Headline must be less than 100 characters"),
  bio: z
    .string()
    .min(50, "Bio must be at least 50 characters")
    .max(1000, "Bio must be less than 1000 characters"),
})

export const reviewApplicationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNote: z
    .string()
    .max(500, "Note must be less than 500 characters")
    .optional(),
})

export const onboardingSchema = z.object({
  teachingExperience: z.enum(["informal", "professional", "online", "other"]),
  videoExperience: z.enum(["beginner", "some-knowledge", "experienced", "videos-ready"]),
  audienceSize: z.enum(["none", "small", "sizeable"]),
})

export type ProfileInput = z.infer<typeof profileSchema>
export type BecomeInstructorInput = z.infer<typeof becomeInstructorSchema>
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
