import { z } from "zod"

/**
 * Phase 10 — Spec §18 Security. Typed, validated environment accessor.
 *
 * Import `env.DATABASE_URL` instead of `process.env.DATABASE_URL`. Required
 * vars that are missing surface as a single readable error at module load,
 * rather than a `TypeError: Cannot read properties of undefined` a hundred
 * call-sites later. Optional vars flow through as `string | undefined`.
 *
 * Validation runs once per process — not on every access — so this is
 * cheap in hot paths.
 */

const schema = z.object({
  // --- Required core ---
  DATABASE_URL: z
    .string()
    .startsWith("postgres", "DATABASE_URL must be a Postgres connection string"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be ≥32 chars (use `openssl rand -base64 32`)"),

  // NEXT_PUBLIC_APP_URL is required at build time for OAuth callbacks and
  // email links. Allow localhost for dev.
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a full URL"),

  // --- Optional core — production requires them but dev works without ---
  AUTH_URL: z.string().url().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().optional(),
  NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: z.string().optional(),

  // --- OAuth (optional) ---
  AUTH_GOOGLE_ID: z.string().optional(),
  AUTH_GOOGLE_SECRET: z.string().optional(),
  AUTH_GITHUB_ID: z.string().optional(),
  AUTH_GITHUB_SECRET: z.string().optional(),

  // --- Phase 7 (AI Assist) ---
  ANTHROPIC_API_KEY: z.string().optional(),
  // AES-256-GCM key used to encrypt per-tenant Claude credentials at
  // rest. Required as soon as any Academy stores its own token via the
  // Academy Admin Settings UI. Generate with `openssl rand -base64 32`.
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),

  // --- Phase 4 (email reminders) ---
  RESEND_API_KEY: z.string().optional(),
  // EMAIL_FROM accepts `addr@host` or `Display Name <addr@host>`. Empty
  // string and undefined both mean "not configured" — the email helper
  // skips sending in both cases, so no boot-time format validation is
  // needed. Resend rejects malformed senders at send time with a clear
  // error message that lands in the audit log.
  EMAIL_FROM: z.string().optional(),

  // --- Cron auth ---
  VERCEL_CRON_SECRET: z.string().optional(),

  // --- Phase 10 hardening: audit IP hashing salt. Random default is
  // fine — all it does is uncorrelate hashes across deploys. ---
  AUDIT_IP_SALT: z.string().optional(),

  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
})

type Env = z.infer<typeof schema>

function parse(): Env {
  const raw: Record<string, unknown> = {
    DATABASE_URL: process.env.DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    AUTH_URL: process.env.AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    VERCEL_CRON_SECRET: process.env.VERCEL_CRON_SECRET,
    AUDIT_IP_SALT: process.env.AUDIT_IP_SALT,
    NODE_ENV: process.env.NODE_ENV,
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n")
    // Fail fast at boot. Better than a runtime TypeError on first request.
    throw new Error(
      `Invalid or missing environment variables:\n${issues}\n\nSee docs/getting-started/configuration.md for required variables.`
    )
  }
  return result.data
}

// Parse once. Re-imports get the cached result.
export const env: Env = parse()

/**
 * Production-readiness probe. Returns the set of configured integrations
 * so ops can see at a glance which optional services are wired. Used by
 * the /api/health endpoint.
 */
export function integrationStatus() {
  return {
    database: true, // required
    auth: true, // required
    stripe: Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
    cloudinary: Boolean(
      env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET && env.CLOUDINARY_CLOUD_NAME
    ),
    oauth_google: Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET),
    oauth_github: Boolean(env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    credential_encryption: Boolean(env.CREDENTIAL_ENCRYPTION_KEY),
    email: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    cron_auth: Boolean(env.VERCEL_CRON_SECRET),
  }
}
