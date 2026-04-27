import { prisma } from "@/lib/prisma"

export type FeatureFlagContext = {
  academyId?: string | null
}

const cache = new Map<string, { value: boolean; expiresAt: number }>()
const TTL_MS = 30_000

function cacheKey(key: string, academyId: string | null) {
  return `${key}::${academyId ?? "global"}`
}

/**
 * Resolve a feature flag. A tenant-scoped row overrides the global row.
 * Defaults to false when neither row exists.
 */
export async function isEnabled(
  key: string,
  ctx: FeatureFlagContext = {}
): Promise<boolean> {
  const academyId = ctx.academyId ?? null
  const cKey = cacheKey(key, academyId)
  const now = Date.now()

  const hit = cache.get(cKey)
  if (hit && hit.expiresAt > now) return hit.value

  const [scoped, global] = await Promise.all([
    academyId
      ? prisma.featureFlag.findFirst({ where: { key, academyId } })
      : Promise.resolve(null),
    prisma.featureFlag.findFirst({ where: { key, academyId: null } }),
  ])

  const value = scoped?.enabled ?? global?.enabled ?? false
  cache.set(cKey, { value, expiresAt: now + TTL_MS })
  return value
}

export function invalidateFeatureFlagCache(key?: string, academyId?: string | null) {
  if (!key) {
    cache.clear()
    return
  }
  cache.delete(cacheKey(key, academyId ?? null))
}

/**
 * Upsert a feature flag. Pass `academyId: null` (or omit) for a global flag,
 * a real id for a tenant override. Invalidates the local cache.
 */
export async function setFlag(
  key: string,
  enabled: boolean,
  opts: { academyId?: string | null; description?: string } = {}
) {
  const academyId = opts.academyId ?? null
  const existing = await prisma.featureFlag.findFirst({ where: { key, academyId } })

  if (existing) {
    await prisma.featureFlag.update({
      where: { id: existing.id },
      data: { enabled, description: opts.description },
    })
  } else {
    await prisma.featureFlag.create({
      data: { key, academyId, enabled, description: opts.description },
    })
  }
  invalidateFeatureFlagCache(key, academyId)
}
