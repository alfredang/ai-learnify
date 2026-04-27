import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { integrationStatus } from "@/lib/env"

/**
 * Phase 10 — Spec §18 Security & Privacy, uptime.
 *
 * GET /api/health — liveness + readiness probe.
 *
 *   - Liveness: the handler returning 200 means the process is up.
 *   - Readiness: we run a trivial Prisma query so the response only goes
 *     green when the database is reachable too. Without this, a rolling
 *     deploy can start serving 5xxs the moment Neon throttles.
 *
 * No auth — uptime monitors need to hit this without credentials. The
 * response deliberately exposes only boolean flags, never config values.
 */

export const dynamic = "force-dynamic"

export async function GET() {
  const startedAt = Date.now()
  let dbOk = false
  let dbLatencyMs: number | null = null
  let dbError: string | null = null

  try {
    const t0 = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - t0
    dbOk = true
  } catch (err) {
    dbError = err instanceof Error ? err.name : "unknown"
    console.error("[health] db probe failed", err)
  }

  const integrations = integrationStatus()
  const healthy = dbOk

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      uptimeSeconds: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - startedAt,
      db: {
        ok: dbOk,
        latencyMs: dbLatencyMs,
        error: dbError,
      },
      integrations,
    },
    { status: healthy ? 200 : 503 }
  )
}
