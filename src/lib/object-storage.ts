import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

/**
 * Cloudflare R2 object storage (S3-compatible) for large media.
 *
 * Videos — lecture uploads, SCORM Studio lesson videos and SCORM ZIPs —
 * live in R2 so they don't consume the VPS disk and are served from
 * Cloudflare's edge. Images and small files stay on the local store.
 *
 * Configure with:
 *   R2_ACCOUNT_ID         Cloudflare account id
 *   R2_ACCESS_KEY_ID      R2 API token access key
 *   R2_SECRET_ACCESS_KEY  R2 API token secret
 *   R2_BUCKET             bucket name
 *   R2_PUBLIC_BASE_URL    public base URL for the bucket, e.g.
 *                         https://media.example.com or https://pub-xxxx.r2.dev
 *
 * When any variable is missing, `isR2Configured()` is false and callers
 * fall back to the local disk store.
 */

let client: S3Client | null = null

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
  )
}

function r2(): S3Client {
  if (!isR2Configured()) throw new Error("Cloudflare R2 is not configured")
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  }
  return client
}

function bucket(): string {
  return process.env.R2_BUCKET!
}

/** Public URL for an object key (keys are URL-encoded per path segment). */
export function r2PublicUrl(key: string): string {
  const base = process.env.R2_PUBLIC_BASE_URL!.replace(/\/+$/, "")
  return `${base}/${key.split("/").map(encodeURIComponent).join("/")}`
}

/** True when a URL points at our public R2 bucket. */
export function isR2Url(url: string | null | undefined): boolean {
  if (!url || !process.env.R2_PUBLIC_BASE_URL) return false
  return url.startsWith(process.env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "") + "/")
}

/** Make a safe object key: lowercase, ascii, no spaces. */
export function safeKeyPart(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 140) || "file"
  )
}

export async function r2PutObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  cacheControl = "public, max-age=31536000, immutable"
): Promise<string> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    })
  )
  return r2PublicUrl(key)
}

export async function r2ObjectSize(key: string): Promise<number | null> {
  try {
    const head = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return head.ContentLength ?? null
  } catch {
    return null
  }
}

/**
 * Presigned PUT so the browser uploads straight to R2 — the file never
 * passes through (or is stored on) the VPS.
 */
export async function r2PresignPut(
  key: string,
  contentType: string,
  expiresInSeconds = 60 * 30
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const uploadUrl = await getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: expiresInSeconds }
  )
  return { uploadUrl, publicUrl: r2PublicUrl(key), key }
}

/**
 * Allow browser PUT uploads from the app origin and range GETs from
 * anywhere (video seeking). Idempotent; safe to call repeatedly.
 */
export async function r2EnsureCors(appOrigins: string[]): Promise<void> {
  await r2().send(
    new PutBucketCorsCommand({
      Bucket: bucket(),
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: appOrigins,
            AllowedMethods: ["PUT"],
            AllowedHeaders: ["content-type", "cache-control"],
            MaxAgeSeconds: 3600,
          },
          {
            AllowedOrigins: ["*"],
            AllowedMethods: ["GET", "HEAD"],
            AllowedHeaders: ["range"],
            ExposeHeaders: ["content-length", "content-range", "accept-ranges", "etag"],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    })
  )
}
