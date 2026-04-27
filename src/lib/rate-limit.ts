/**
 * Phase 9 — Spec §18 Security & Privacy.
 *
 * Simple in-memory rate limiter keyed by `{route, key}`. Good enough for
 * single-instance deploys and development; production should swap in a
 * Redis-backed limiter (e.g. Upstash) because a multi-instance deploy
 * would let each replica count independently.
 *
 * Usage from an API route:
 *
 *   const limit = checkRateLimit({
 *     route: "auth.login",
 *     key: ipHashOrEmail,
 *     limit: 10,
 *     windowMs: 60_000,
 *   })
 *   if (!limit.ok) return new Response("Too many requests", { status: 429, headers: limit.headers })
 */

type Bucket = {
  count: number
  resetAt: number
}

type Entry = {
  buckets: Map<string, Bucket>
}

// Keyed by route. Each route has its own per-key buckets.
const store = new Map<string, Entry>()

// Evict stale buckets opportunistically — called from checkRateLimit.
function sweep(now: number) {
  for (const entry of store.values()) {
    for (const [k, b] of entry.buckets) {
      if (b.resetAt <= now) entry.buckets.delete(k)
    }
  }
}

export type RateLimitCheck = {
  route: string
  key: string           // IP hash, email, user id, etc. Be specific to avoid cross-user leaks.
  limit: number         // max requests per window
  windowMs: number      // window size in ms
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  resetAt: number
  headers: Record<string, string>
}

/**
 * Atomically check + bump the counter for this (route, key) pair. Returns
 * `ok: false` if the limit has been exceeded; the caller should reject
 * with 429.
 */
export function checkRateLimit(check: RateLimitCheck): RateLimitResult {
  const now = Date.now()
  // Keep the store from growing unboundedly in long-lived processes.
  if (Math.random() < 0.01) sweep(now)

  let entry = store.get(check.route)
  if (!entry) {
    entry = { buckets: new Map() }
    store.set(check.route, entry)
  }
  let bucket = entry.buckets.get(check.key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + check.windowMs }
    entry.buckets.set(check.key, bucket)
  }
  bucket.count += 1
  const remaining = Math.max(0, check.limit - bucket.count)
  const ok = bucket.count <= check.limit

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(check.limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.floor(bucket.resetAt / 1000)),
  }
  if (!ok) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
    headers["Retry-After"] = String(retryAfter)
  }
  return { ok, remaining, resetAt: bucket.resetAt, headers }
}

/**
 * Convenience wrapper for API route handlers — derives a key from the
 * request IP + optional identifier (e.g. email on login). Pair with
 * `getRequestIp` from `src/lib/audit.ts` for the IP.
 */
export function rateLimitFromRequest(
  request: Request,
  opts: {
    route: string
    limit: number
    windowMs: number
    /** Additional identifier appended to the IP key — e.g. email on login. */
    identifier?: string | null
  }
): RateLimitResult {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  const key = opts.identifier ? `${ip}|${opts.identifier}` : ip
  return checkRateLimit({
    route: opts.route,
    key,
    limit: opts.limit,
    windowMs: opts.windowMs,
  })
}
