import { createReadStream } from "node:fs"
import { mkdir, stat, writeFile, readdir, rm } from "node:fs/promises"
import path from "node:path"
import { randomBytes } from "node:crypto"

/**
 * Disk-backed file storage for runtime uploads (lecture videos, course
 * images, generated SCORM packages).
 *
 * Files live under `STORAGE_DIR` (default `./storage`), which the Docker
 * deployment mounts as a persistent volume so uploads survive redeploys.
 * Everything saved here is served by the `/uploads/[...path]` route with
 * HTTP Range support, so `<video>` seeking and SCORM iframes both work.
 *
 * Cloudinary remains the preferred media CDN when configured; this store
 * is the fallback (and the only home for SCORM packages, which need to
 * be same-origin for the SCORM API bridge).
 */

export const STORAGE_ROOT = path.resolve(process.cwd(), process.env.STORAGE_DIR || "storage")

/** Public URL prefix the `/uploads` route serves. */
export const UPLOADS_URL_PREFIX = "/uploads"

export type StorageKind = "images" | "videos" | "scorm" | "documents"

export function sanitizeFileName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  return base.length > 0 ? base.slice(0, 120) : "file"
}

export function randomId(bytes = 8): string {
  return randomBytes(bytes).toString("hex")
}

/** Resolve a storage-relative path, refusing anything that escapes the root. */
export function resolveStoragePath(relative: string): string {
  const abs = path.resolve(STORAGE_ROOT, relative)
  if (abs !== STORAGE_ROOT && !abs.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Invalid storage path")
  }
  return abs
}

export function publicUrlFor(relative: string): string {
  const clean = relative.split(path.sep).join("/").replace(/^\/+/, "")
  return `${UPLOADS_URL_PREFIX}/${clean.split("/").map(encodeURIComponent).join("/")}`
}

export async function ensureDir(relative: string): Promise<string> {
  const abs = resolveStoragePath(relative)
  await mkdir(abs, { recursive: true })
  return abs
}

/**
 * Save a buffer under `<kind>/<fileName>` and return the public URL plus
 * the storage-relative path.
 */
export async function saveFile(
  kind: StorageKind,
  fileName: string,
  data: Buffer | Uint8Array,
  subdir?: string
): Promise<{ url: string; relativePath: string; absolutePath: string }> {
  const dirRel = subdir ? path.join(kind, subdir) : kind
  const dirAbs = await ensureDir(dirRel)
  const safeName = sanitizeFileName(fileName)
  const abs = path.join(dirAbs, safeName)
  await writeFile(abs, data)
  const relativePath = path.join(dirRel, safeName)
  return { url: publicUrlFor(relativePath), relativePath, absolutePath: abs }
}

export async function fileInfo(relative: string): Promise<{ size: number; mtime: Date } | null> {
  try {
    const s = await stat(resolveStoragePath(relative))
    if (!s.isFile()) return null
    return { size: s.size, mtime: s.mtime }
  } catch {
    return null
  }
}

export function openReadStream(relative: string, range?: { start: number; end: number }) {
  return createReadStream(resolveStoragePath(relative), range)
}

export async function listFiles(relativeDir: string): Promise<string[]> {
  const abs = resolveStoragePath(relativeDir)
  const out: string[] = []
  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel)
      else out.push(rel)
    }
  }
  try {
    await walk(abs, "")
  } catch {
    return []
  }
  return out.sort()
}

export async function removeDir(relativeDir: string): Promise<void> {
  await rm(resolveStoragePath(relativeDir), { recursive: true, force: true })
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".xsd": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".srt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
}

export function contentTypeFor(fileName: string): string {
  return MIME[path.extname(fileName).toLowerCase()] ?? "application/octet-stream"
}
