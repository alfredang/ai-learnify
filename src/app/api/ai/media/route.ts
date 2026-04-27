import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"

/**
 * Phase 7 / Spec §8.2 — licence-free media curation.
 *
 * Proxies an Openverse search. Openverse (https://openverse.org) aggregates
 * Creative Commons and public-domain media — exactly the "public domain /
 * Creative Commons / platform-approved licence-free" set the spec calls
 * out. No API key required; results already carry licence metadata.
 *
 * Tenancy: callers must be Course Developer / Academy Admin / Platform
 * Owner on the target academy, and the academy's `aiEnabled` flag must
 * be true (same gate as /api/ai/assist).
 *
 * Output shape exactly matches what Resource expects for licence
 * metadata, so a frontend can drop the chosen row straight into a
 * `prisma.resource.create` payload.
 */

const schema = z.object({
  academyId: z.string().min(1),
  query: z.string().min(2).max(200),
  kind: z.enum(["image", "audio"]).default("image"),
  /**
   * SPDX-ish license filters supported by Openverse. "all-cc" is the
   * default convenience union.
   */
  license: z
    .enum([
      "all-cc",
      "commercial",
      "cc0",
      "pdm",
      "by",
      "by-sa",
      "by-nc",
      "by-nd",
      "by-nc-sa",
      "by-nc-nd",
    ])
    .default("all-cc"),
  pageSize: z.number().int().min(1).max(20).default(10),
})

type OpenverseImage = {
  id: string
  title?: string
  creator?: string
  creator_url?: string
  url: string
  thumbnail: string
  license: string
  license_version?: string
  license_url?: string
  source?: string
  foreign_landing_url?: string
  attribution?: string
  width?: number
  height?: number
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    )
  }

  const input = parsed.data

  const academy = await prisma.academy.findUnique({
    where: { id: input.academyId },
    select: { id: true, aiEnabled: true },
  })
  if (!academy) {
    return NextResponse.json({ error: "Academy not found" }, { status: 404 })
  }

  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const allowedRoles = new Set(["ACADEMY_ADMIN", "COURSE_DEVELOPER"])
  const isMember = session.user.memberships?.some(
    (m) => m.academyId === input.academyId && allowedRoles.has(m.role)
  )
  if (!isOwner && !isMember) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!academy.aiEnabled) {
    return NextResponse.json(
      {
        error:
          "AI Assist is disabled for this academy. Enable it in Academy Settings.",
      },
      { status: 409 }
    )
  }

  // Build Openverse URL. Filters:
  //   - license_type="commercial" allows commercial reuse (safer default)
  //   - fall back to "all-cc" when the caller is fine with non-commercial.
  const endpoint =
    input.kind === "image"
      ? "https://api.openverse.org/v1/images/"
      : "https://api.openverse.org/v1/audio/"
  const url = new URL(endpoint)
  url.searchParams.set("q", input.query)
  url.searchParams.set("page_size", String(input.pageSize))
  if (input.license === "all-cc") {
    url.searchParams.set("license_type", "all-cc")
  } else if (input.license === "commercial") {
    url.searchParams.set("license_type", "commercial")
  } else {
    url.searchParams.set("license", input.license)
  }
  // Filter out mature content.
  url.searchParams.set("mature", "false")

  let results: OpenverseImage[] = []
  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      // Openverse is rate-limited anonymously; 10s is generous.
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Openverse ${res.status}` },
        { status: 502 }
      )
    }
    const body = (await res.json()) as { results?: OpenverseImage[] }
    results = body.results ?? []
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Openverse request failed",
      },
      { status: 502 }
    )
  }

  // Normalise — shape each hit so the caller can drop directly into a
  // Resource create. Spec §8.2: "Asset licence metadata stored".
  const normalised = results.map((r) => ({
    providerId: r.id,
    title: r.title ?? input.query,
    url: r.url,
    thumbnailUrl: r.thumbnail,
    license: r.license, // "cc0", "by", "by-sa", "pdm", etc.
    licenseVersion: r.license_version ?? null,
    licenseUrl: r.license_url ?? null,
    sourceUrl: r.foreign_landing_url ?? null,
    sourceProvider: "openverse" as const,
    attribution:
      r.attribution ??
      (r.creator
        ? `${r.title ?? "Untitled"} by ${r.creator} · ${r.license.toUpperCase()}`
        : null),
    creator: r.creator ?? null,
    creatorUrl: r.creator_url ?? null,
    dimensions:
      r.width && r.height ? { width: r.width, height: r.height } : null,
  }))

  await audit({
    action: "ai.media.search",
    resourceType: "aiMedia",
    userId: session.user.id,
    academyId: input.academyId,
    metadata: {
      query: input.query,
      kind: input.kind,
      license: input.license,
      resultCount: normalised.length,
    },
  })

  return NextResponse.json({
    provider: "openverse",
    query: input.query,
    results: normalised,
  })
}
