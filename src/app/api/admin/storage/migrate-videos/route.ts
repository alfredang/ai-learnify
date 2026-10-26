import { readFile, rm } from "node:fs/promises"
import path from "node:path"
import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { audit } from "@/lib/audit"
import { contentTypeFor, fileInfo, resolveStoragePath } from "@/lib/storage"
import {
  isR2Configured,
  r2EnsureCors,
  r2ObjectSize,
  r2PublicUrl,
  r2PutObject,
  safeKeyPart,
} from "@/lib/object-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 900

const schema = z.object({
  dryRun: z.boolean().default(false),
  /** Remove the local file once every row that used it points at R2. */
  deleteLocal: z.boolean().default(false),
})

type Item = { url: string; lectureIds: string[]; courseIds: string[] }

/**
 * POST /api/admin/storage/migrate-videos
 *
 * One-off (idempotent) move of locally stored videos to Cloudflare R2:
 * lecture videos and course preview videos whose URL starts with
 * `/uploads/videos/`. Each file is uploaded once, its size verified in R2,
 * then every referencing row is repointed. Also applies the bucket CORS
 * policy needed for direct browser uploads.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`, or a Platform Owner session.
 */
export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  const cronOk = Boolean(process.env.CRON_SECRET && bearer === process.env.CRON_SECRET)
  const session = cronOk ? null : await auth()
  if (!cronOk && session?.user?.platformRole !== "PLATFORM_OWNER") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isR2Configured()) {
    return NextResponse.json({ error: "Cloudflare R2 is not configured", code: "R2_NOT_CONFIGURED" }, { status: 409 })
  }

  const opts = schema.parse(await request.json().catch(() => ({})))

  const appOrigins = Array.from(
    new Set([process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL, "http://localhost:3000"].filter(Boolean) as string[])
  ).map((u) => new URL(u).origin)
  if (!opts.dryRun) await r2EnsureCors(appOrigins)

  const [lectures, courses] = await Promise.all([
    prisma.lecture.findMany({
      where: { videoUrl: { startsWith: "/uploads/videos/" } },
      select: { id: true, videoUrl: true },
    }),
    prisma.course.findMany({
      where: { previewVideoUrl: { startsWith: "/uploads/videos/" } },
      select: { id: true, previewVideoUrl: true },
    }),
  ])

  const byUrl = new Map<string, Item>()
  const itemFor = (url: string) => {
    let item = byUrl.get(url)
    if (!item) {
      item = { url, lectureIds: [], courseIds: [] }
      byUrl.set(url, item)
    }
    return item
  }
  for (const l of lectures) itemFor(l.videoUrl!).lectureIds.push(l.id)
  for (const c of courses) itemFor(c.previewVideoUrl!).courseIds.push(c.id)

  const results: Array<{ url: string; status: string; newUrl?: string; bytes?: number; error?: string }> = []
  let movedBytes = 0

  for (const item of byUrl.values()) {
    const relative = decodeURIComponent(item.url.replace(/^\/uploads\//, ""))
    const info = await fileInfo(relative).catch(() => null)
    if (!info) {
      results.push({ url: item.url, status: "missing-local-file" })
      continue
    }
    const fileName = path.posix.basename(relative)
    const key = `videos/legacy/${safeKeyPart(fileName)}`
    if (opts.dryRun) {
      results.push({ url: item.url, status: "would-move", bytes: info.size })
      continue
    }
    try {
      let size = await r2ObjectSize(key)
      let newUrl: string
      if (size !== info.size) {
        const body = await readFile(resolveStoragePath(relative))
        newUrl = await r2PutObject(key, body, contentTypeFor(fileName))
        size = await r2ObjectSize(key)
      } else {
        newUrl = r2PublicUrl(key) // already uploaded on a previous run
      }
      if (size !== info.size) throw new Error(`size mismatch after upload (${size} vs ${info.size})`)

      await prisma.$transaction([
        ...item.lectureIds.map((id) => prisma.lecture.update({ where: { id }, data: { videoUrl: newUrl } })),
        ...item.courseIds.map((id) => prisma.course.update({ where: { id }, data: { previewVideoUrl: newUrl } })),
      ])
      await audit({
        action: "storage.video.migrated_to_r2",
        resourceType: "media",
        metadata: { from: item.url, to: newUrl, bytes: info.size, lectures: item.lectureIds, courses: item.courseIds },
      })
      if (opts.deleteLocal) await rm(resolveStoragePath(relative), { force: true })
      movedBytes += info.size
      results.push({ url: item.url, status: opts.deleteLocal ? "moved-and-deleted" : "moved", newUrl, bytes: info.size })
    } catch (e) {
      results.push({ url: item.url, status: "error", error: e instanceof Error ? e.message : String(e) })
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    data: {
      dryRun: opts.dryRun,
      corsOrigins: appOrigins,
      files: byUrl.size,
      movedMB: Math.round((movedBytes / 1024 / 1024) * 10) / 10,
      summary,
      results,
    },
  })
}
