import { z } from "zod"

/**
 * Spec §13 — layout knobs surfaced by the academy template editor.
 * Mirrored at runtime by `CertificateLayoutJson` in src/lib/certificate-html.ts.
 */
export const certificateLayoutSchema = z.object({
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a hex color, e.g. #1a365d")
    .optional(),
  fontFamily: z.enum(["serif", "sans"]).optional(),
  signatureImageUrl: z.string().url().nullable().optional(),
  watermarkText: z.string().max(60).nullable().optional(),
  watermarkOpacity: z.number().min(0.05).max(0.25).optional(),
  borderStyle: z.enum(["solid", "double", "none"]).optional(),
})

export const certificateTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  primaryLogoUrl: z.string().url().nullable().optional(),
  secondaryLogoUrl: z.string().url().nullable().optional(),
  signatoryName: z.string().max(80).nullable().optional(),
  signatoryTitle: z.string().max(80).nullable().optional(),
  layoutJson: certificateLayoutSchema.nullable().optional(),
  isDefault: z.boolean().optional(),
})

export type CertificateTemplateInput = z.infer<typeof certificateTemplateSchema>
export type CertificateLayoutInput = z.infer<typeof certificateLayoutSchema>
