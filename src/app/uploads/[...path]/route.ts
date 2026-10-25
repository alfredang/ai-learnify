import { Readable } from "node:stream"
import { NextResponse } from "next/server"
import { contentTypeFor, fileInfo, openReadStream } from "@/lib/storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Serves files from STORAGE_DIR at `/uploads/<kind>/<path>`.
 *
 * - Honours `Range` requests so `<video>` can seek and large SCORM media
 *   streams progressively.
 * - Strong ETag from size+mtime; `If-None-Match` short-circuits to 304.
 * - HTML inside SCORM packages is served same-origin so the SCO can find
 *   `window.parent.API`; nothing here is ever executed server-side.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: parts } = await params
  const relative = parts.map((p) => decodeURIComponent(p)).join("/")
  if (relative.includes("..") || relative.startsWith("/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  let info
  try {
    info = await fileInfo(relative)
  } catch {
    info = null
  }
  if (!info) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtime.getTime() / 1000).toString(16)}"`
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }

  const fileName = relative.slice(relative.lastIndexOf("/") + 1)
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(fileName),
    "Accept-Ranges": "bytes",
    ETag: etag,
    "Last-Modified": info.mtime.toUTCString(),
    "Cache-Control": relative.startsWith("scorm/")
      ? "private, max-age=0, must-revalidate"
      : "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  }

  const rangeHeader = request.headers.get("range")
  if (rangeHeader) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (!m) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      })
    }
    let start = m[1] ? parseInt(m[1], 10) : NaN
    let end = m[2] ? parseInt(m[2], 10) : NaN
    if (Number.isNaN(start)) {
      // suffix range: last N bytes
      start = Math.max(0, info.size - end)
      end = info.size - 1
    } else if (Number.isNaN(end) || end >= info.size) {
      end = info.size - 1
    }
    if (start > end || start >= info.size) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      })
    }
    const stream = Readable.toWeb(openReadStream(relative, { start, end })) as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${info.size}`,
        "Content-Length": String(end - start + 1),
      },
    })
  }

  const stream = Readable.toWeb(openReadStream(relative)) as ReadableStream
  return new Response(stream, {
    status: 200,
    headers: { ...headers, "Content-Length": String(info.size) },
  })
}

export async function HEAD(
  request: Request,
  ctx: { params: Promise<{ path: string[] }> }
) {
  const res = await GET(request, ctx)
  return new Response(null, { status: res.status, headers: res.headers })
}
