import { zipSync, type Zippable } from "fflate"
import type { PackageFile } from "@/lib/scorm/types"

/**
 * Build a SCORM-importable ZIP with `imsmanifest.xml` at the archive
 * root. Media that is already compressed (mp4, webm, jpg, png, zip) is
 * stored uncompressed so packaging a large video is fast.
 */
const STORE_ONLY = new Set([".mp4", ".m4v", ".webm", ".mov", ".mp3", ".m4a", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".zip", ".woff", ".woff2"])

export function zipPackage(files: PackageFile[]): Buffer {
  const entries: Zippable = {}
  for (const f of files) {
    const data = typeof f.data === "string" ? Buffer.from(f.data, "utf8") : f.data
    const ext = f.path.slice(f.path.lastIndexOf(".")).toLowerCase()
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    entries[f.path] = STORE_ONLY.has(ext) ? [bytes, { level: 0 }] : [bytes, { level: 6 }]
  }
  const out = zipSync(entries, { level: 6 })
  return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
}
