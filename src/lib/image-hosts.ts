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
  // Either an exact hostname, or a "*.example.com" wildcard matching any
  // single-level or deeper subdomain. The asterisk MUST be the leftmost
  // label — wildcards in the middle are not supported.
  hostname: string
  pathPrefix?: string
}

export const ALLOWED_IMAGE_HOSTS: AllowedImageHost[] = [
  { hostname: "images.unsplash.com" },
  { hostname: "res.cloudinary.com" },
  { hostname: "randomuser.me" },
  { hostname: "lh3.googleusercontent.com" },
  { hostname: "avatars.githubusercontent.com" },
  // Free placeholder services — useful when Cloudinary isn't configured
  // (dev/demo environments). Safe to keep in production: they only serve
  // images, no user uploads, and Next.js still does image optimisation.
  { hostname: "picsum.photos" },
  { hostname: "placehold.co" },
  { hostname: "via.placeholder.com" },
  { hostname: "loremflickr.com" },
  // Licence-free media sources used by AI Assist (Openverse + Wikimedia
  // curation pipeline). All images served are CC-licensed; the licence
  // and attribution are stored alongside the URL on the Course row.
  { hostname: "upload.wikimedia.org" },
  { hostname: "*.staticflickr.com" },
  { hostname: "*.wp.com" },
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
  const trimmed = input.trim()

  // Local uploads served from STORAGE_DIR — see /api/upload/local and /uploads/[...path].
  if (trimmed.startsWith("/uploads/")) {
    return { ok: true, url: trimmed }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: "INVALID_URL" }
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "INSECURE_PROTOCOL" }
  }
  const match = ALLOWED_IMAGE_HOSTS.find(
    (h) =>
      hostnameMatches(h.hostname, parsed.hostname) &&
      (!h.pathPrefix || parsed.pathname.startsWith(h.pathPrefix))
  )
  if (!match) return { ok: false, reason: "BLOCKED_HOST" }
  return { ok: true, url: parsed.toString() }
}

function hostnameMatches(pattern: string, actual: string): boolean {
  if (pattern === actual) return true
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1) // ".example.com"
    return actual.endsWith(suffix) && actual.length > suffix.length
  }
  return false
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
