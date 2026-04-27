/**
 * Allowed image hosts. Single source of truth — used by:
 *   - next.config.ts (images.remotePatterns)
 *   - course thumbnail validation in /api/courses/[id]
 *   - any future profile-image / banner upload validation
 *
 * Adding a host:
 *   1. Append { hostname, optional pathPrefix } below
 *   2. Restart `npm run dev` so next.config picks up the change
 *
 * The pathPrefix is optional — when set, only URLs whose pathname starts
 * with it are accepted. Use this to gate a wildcard CDN to your own
 * account (e.g. Cloudinary cloud name).
 */

export type AllowedImageHost = {
  hostname: string
  pathPrefix?: string
}

export const ALLOWED_IMAGE_HOSTS: AllowedImageHost[] = [
  { hostname: "images.unsplash.com" },
  { hostname: "res.cloudinary.com" },
  { hostname: "randomuser.me" },
  { hostname: "lh3.googleusercontent.com" },
  { hostname: "avatars.githubusercontent.com" },
]

export const ALLOWED_IMAGE_HOST_LIST = ALLOWED_IMAGE_HOSTS.map((h) => h.hostname)

export type ImageUrlValidation =
  | { ok: true; url: string }
  | { ok: false; reason: "INVALID_URL" | "INSECURE_PROTOCOL" | "BLOCKED_HOST" }

/**
 * Validates a thumbnail / image URL against the allowlist. Empty or
 * undefined input is treated as "ok" (callers handle clearing
 * separately) so this can be used directly on optional fields.
 */
export function validateImageUrl(input: string | null | undefined): ImageUrlValidation {
  if (!input || input.trim() === "") return { ok: true, url: "" }
  let parsed: URL
  try {
    parsed = new URL(input.trim())
  } catch {
    return { ok: false, reason: "INVALID_URL" }
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "INSECURE_PROTOCOL" }
  }
  const match = ALLOWED_IMAGE_HOSTS.find(
    (h) =>
      h.hostname === parsed.hostname &&
      (!h.pathPrefix || parsed.pathname.startsWith(h.pathPrefix))
  )
  if (!match) return { ok: false, reason: "BLOCKED_HOST" }
  return { ok: true, url: parsed.toString() }
}

export function explainImageUrlReason(reason: Exclude<ImageUrlValidation, { ok: true }>["reason"]): string {
  switch (reason) {
    case "INVALID_URL":
      return "That doesn't look like a valid URL."
    case "INSECURE_PROTOCOL":
      return "Image URL must start with https://"
    case "BLOCKED_HOST":
      return `Image must be hosted on one of: ${ALLOWED_IMAGE_HOST_LIST.join(
        ", "
      )}.`
  }
}
