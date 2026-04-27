import { z } from "zod"

// Spec §3.2 — non-learner roles can sign in with username OR email, so
// the login field accepts either. The `email` key is kept for backward
// compatibility with existing callers; auth.ts also reads `identifier`.
export const loginSchema = z.object({
  email: z
    .string()
    .min(3, "Enter your email or username")
    .max(254),
  password: z.string().min(1, "Password is required"),
})

// IESA LMS spec §3.1 / §5.1: learners register with email + password only,
// must provide the name they want printed on certificates and the name to be
// called throughout the LMS. Identification number is optional.
export const registerSchema = z
  .object({
    nameToBeCalled: z
      .string()
      .min(2, "Name to be called must be at least 2 characters")
      .max(80, "Name to be called is too long"),
    certificateName: z
      .string()
      .min(2, "Name on certificate must be at least 2 characters")
      .max(120, "Name on certificate is too long"),
    certificateIdNumber: z
      .string()
      .max(64, "ID number is too long")
      .optional()
      .or(z.literal("")),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
})

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
