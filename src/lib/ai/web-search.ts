/**
 * Node-side licence-free media search for the AI Media Curator
 * (Phase 7 — Spec §8.2).
 *
 * Rather than relying on a model-side web search tool (which differs
 * between OpenAI and DeepSeek), we run the searches ourselves against
 * open licence catalogues and pass the candidates to the model as plain
 * text in the user turn. The model then ranks/dedupes/normalises into the shape the
 * Resource model expects.
 *
 * Sources used:
 *   - Openverse  (Creative Commons + public domain images & audio)
 *   - Wikimedia  (CC, public domain — broad coverage, very stable API)
 *
 * Ported from the `cw-slides-websearch.ts` pattern in
 * alfredang/AI-LMS-TMS, narrowed to the licence-aware sources we
 * actually want for course assets.
 */

export type MediaCandidate = {
  providerId: string
  title: string
  url: string
  thumbnailUrl: string | null
  license: string
  licenseVersion?: string | null
  licenseUrl?: string | null
  sourceUrl: string | null
  sourceProvider: "openverse" | "wikimedia"
  attribution: string | null
  creator?: string | null
  creatorUrl?: string | null
  width?: number | null
  height?: number | null
}

const FETCH_TIMEOUT_MS = 10_000

type OpenverseHit = {
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

export async function searchOpenverse(
  q: string,
  kind: "image" | "audio",
  pageSize: number,
  license: string
): Promise<MediaCandidate[]> {
  const endpoint =
    kind === "image"
      ? "https://api.openverse.org/v1/images/"
      : "https://api.openverse.org/v1/audio/"
  const url = new URL(endpoint)
  url.searchParams.set("q", q)
  url.searchParams.set("page_size", String(pageSize))
  if (license === "all-cc") url.searchParams.set("license_type", "all-cc")
  else if (license === "commercial")
    url.searchParams.set("license_type", "commercial")
  else url.searchParams.set("license", license)
  url.searchParams.set("mature", "false")

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) return []
  const body = (await res.json()) as { results?: OpenverseHit[] }
  return (body.results ?? []).map((r) => ({
    providerId: r.id,
    title: r.title ?? q,
    url: r.url,
    thumbnailUrl: r.thumbnail ?? null,
    license: r.license,
    licenseVersion: r.license_version ?? null,
    licenseUrl: r.license_url ?? null,
    sourceUrl: r.foreign_landing_url ?? null,
    sourceProvider: "openverse",
    attribution:
      r.attribution ??
      (r.creator
        ? `${r.title ?? "Untitled"} by ${r.creator} · ${r.license.toUpperCase()}`
        : null),
    creator: r.creator ?? null,
    creatorUrl: r.creator_url ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
  }))
}

type WikimediaPage = {
  pageid: number
  title: string
  imageinfo?: Array<{
    url: string
    thumburl?: string
    thumbwidth?: number
    thumbheight?: number
    descriptionurl?: string
    extmetadata?: Record<string, { value?: string }>
  }>
}

export async function searchWikimedia(
  q: string,
  pageSize: number
): Promise<MediaCandidate[]> {
  // commons.wikimedia.org search via the MediaWiki API with imageinfo
  // extmetadata returns license + author + description URL for each hit.
  const url = new URL("https://commons.wikimedia.org/w/api.php")
  url.searchParams.set("action", "query")
  url.searchParams.set("format", "json")
  url.searchParams.set("origin", "*")
  url.searchParams.set("generator", "search")
  url.searchParams.set("gsrsearch", `filetype:bitmap ${q}`)
  url.searchParams.set("gsrlimit", String(Math.min(pageSize, 20)))
  url.searchParams.set("gsrnamespace", "6") // File: namespace
  url.searchParams.set("prop", "imageinfo")
  url.searchParams.set(
    "iiprop",
    "url|extmetadata|size|mime|user"
  )
  url.searchParams.set("iiurlwidth", "640")
  url.searchParams.set("iiextmetadatafilter", "License|LicenseShortName|LicenseUrl|Artist|ImageDescription")

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "iesa-lms-authoring/1.0 (media-curator)",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) return []
  const body = (await res.json()) as {
    query?: { pages?: Record<string, WikimediaPage> }
  }
  const pages = body.query?.pages ? Object.values(body.query.pages) : []

  return pages
    .map((p): MediaCandidate | null => {
      const ii = p.imageinfo?.[0]
      if (!ii) return null
      const meta = ii.extmetadata ?? {}
      const license = (
        meta.LicenseShortName?.value ??
        meta.License?.value ??
        ""
      ).toString()
      // Wikimedia returns rich HTML for Artist / ImageDescription — strip
      // tags so the model sees plain text candidates.
      const artist = (meta.Artist?.value ?? "")
        .toString()
        .replace(/<[^>]+>/g, "")
        .trim()
      const title = p.title.replace(/^File:/, "")
      return {
        providerId: String(p.pageid),
        title,
        url: ii.url,
        thumbnailUrl: ii.thumburl ?? null,
        license: license || "unknown",
        licenseVersion: null,
        licenseUrl: meta.LicenseUrl?.value ?? null,
        sourceUrl: ii.descriptionurl ?? null,
        sourceProvider: "wikimedia",
        attribution: artist
          ? `${title} by ${artist} · ${license || "Wikimedia Commons"}`
          : `${title} · Wikimedia Commons`,
        creator: artist || null,
        creatorUrl: null,
        width: ii.thumbwidth ?? null,
        height: ii.thumbheight ?? null,
      }
    })
    .filter((c): c is MediaCandidate => c !== null && Boolean(c.license))
}

export async function gatherMediaCandidates(opts: {
  query: string
  kind: "image" | "audio"
  pageSize: number
  license: string
}): Promise<MediaCandidate[]> {
  // Run sources in parallel; both fail closed (return [] on error) so a
  // dead source can't take down the whole curator.
  const results = await Promise.allSettled([
    searchOpenverse(opts.query, opts.kind, opts.pageSize, opts.license),
    // Wikimedia API only meaningfully supports image search.
    opts.kind === "image"
      ? searchWikimedia(opts.query, opts.pageSize)
      : Promise.resolve<MediaCandidate[]>([]),
  ])
  const all: MediaCandidate[] = []
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value)
  }
  return all
}
