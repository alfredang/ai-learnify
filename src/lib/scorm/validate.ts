import type { PackageFile, ValidationCheck, ValidationReport } from "@/lib/scorm/types"
import { probeMp4 } from "@/lib/scorm/mp4"

/**
 * SCORM 1.2 conformance checks the SCORM Studio runs before a package is
 * published or attached to a lecture. This is a practical validator
 * (manifest structure, resource/file integrity, run-time API usage,
 * browser-safe media) rather than a full ADL test-suite replacement —
 * every check maps to a requirement that commonly breaks LMS imports.
 */

function text(data: Buffer | string): string {
  return typeof data === "string" ? data : data.toString("utf8")
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag) ?? new RegExp(`\\s${name}\\s*=\\s*'([^']*)'`, "i").exec(tag)
  return m ? m[1] : null
}

/** Cheap well-formedness check: balanced open/close tags, no stray `<`. */
function isWellFormedXml(xml: string): { ok: boolean; reason?: string } {
  const body = xml.replace(/<\?xml[^>]*\?>/, "").replace(/<!--[\s\S]*?-->/g, "")
  const stack: string[] = []
  const re = /<\/?([A-Za-z_][\w:.-]*)[^<>]*?(\/?)>/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) {
    const between = body.slice(last, m.index)
    if (between.includes("<") || between.includes(">")) {
      return { ok: false, reason: "stray '<' or '>' between tags" }
    }
    last = m.index + m[0].length
    const [full, name, selfClose] = m
    if (full.startsWith("</")) {
      const open = stack.pop()
      if (open !== name) return { ok: false, reason: `closing </${name}> does not match <${open ?? "nothing"}>` }
    } else if (!selfClose) {
      stack.push(name)
    }
  }
  if (stack.length > 0) return { ok: false, reason: `unclosed <${stack[stack.length - 1]}>` }
  return { ok: true }
}

export function validateScorm12Package(files: PackageFile[]): ValidationReport {
  const checks: ValidationCheck[] = []
  const paths = new Set(files.map((f) => f.path.replace(/\\/g, "/")))
  const byPath = new Map(files.map((f) => [f.path.replace(/\\/g, "/"), f]))
  let manifestIdentifier: string | null = null
  let launchFile: string | null = null

  const add = (c: ValidationCheck) => checks.push(c)

  // 1. Manifest present at root
  const manifest = byPath.get("imsmanifest.xml")
  if (!manifest) {
    add({ id: "manifest.present", label: "imsmanifest.xml at package root", status: "fail", detail: "Missing — LMS importers refuse the package." })
    return finish(checks, manifestIdentifier, launchFile)
  }
  add({ id: "manifest.present", label: "imsmanifest.xml at package root", status: "pass" })
  const xml = text(manifest.data)

  // 2. Well-formed XML
  const wf = isWellFormedXml(xml)
  add({
    id: "manifest.wellformed",
    label: "Manifest is well-formed XML",
    status: wf.ok ? "pass" : "fail",
    detail: wf.reason,
  })

  // 3. Schema + version declare SCORM 1.2
  const schema = /<schema>\s*ADL SCORM\s*<\/schema>/i.test(xml)
  const version = /<schemaversion>\s*1\.2\s*<\/schemaversion>/i.test(xml)
  add({
    id: "manifest.schema",
    label: "Declares <schema>ADL SCORM</schema> + <schemaversion>1.2</schemaversion>",
    status: schema && version ? "pass" : "fail",
    detail: schema && version ? undefined : `schema=${schema} version=${version}`,
  })

  // 4. Namespaces
  const nsOk = /xmlns="http:\/\/www\.imsproject\.org\/xsd\/imscp_rootv1p1p2"/.test(xml)
  const adlOk = /xmlns:adlcp="http:\/\/www\.adlnet\.org\/xsd\/adlcp_rootv1p2"/.test(xml)
  add({
    id: "manifest.namespaces",
    label: "IMS CP 1.1.2 and ADL CP 1.2 namespaces declared",
    status: nsOk && adlOk ? "pass" : "fail",
    detail: nsOk && adlOk ? undefined : "Expected imscp_rootv1p1p2 and adlcp_rootv1p2 namespaces",
  })

  // 5. Manifest identifier
  const manifestTag = /<manifest\b[^>]*>/i.exec(xml)?.[0] ?? ""
  manifestIdentifier = attr(manifestTag, "identifier")
  add({
    id: "manifest.identifier",
    label: "Manifest has a unique identifier",
    status: manifestIdentifier ? "pass" : "fail",
    detail: manifestIdentifier ?? "identifier attribute missing",
  })

  // 6. Organizations/default → organization → item → resource
  const orgsTag = /<organizations\b[^>]*>/i.exec(xml)?.[0] ?? ""
  const defaultOrg = attr(orgsTag, "default")
  const orgTags = Array.from(xml.matchAll(/<organization\b[^>]*>/gi)).map((m) => m[0])
  const orgIds = orgTags.map((t) => attr(t, "identifier")).filter(Boolean) as string[]
  add({
    id: "manifest.organization",
    label: "Default organization exists",
    status: orgIds.length > 0 && (!defaultOrg || orgIds.includes(defaultOrg)) ? "pass" : "fail",
    detail: orgIds.length === 0 ? "No <organization> element" : defaultOrg && !orgIds.includes(defaultOrg) ? `default="${defaultOrg}" does not match any organization` : undefined,
  })

  const itemTags = Array.from(xml.matchAll(/<item\b[^>]*>/gi)).map((m) => m[0])
  const itemRefs = itemTags.map((t) => attr(t, "identifierref")).filter(Boolean) as string[]
  add({
    id: "manifest.item",
    label: "At least one launchable <item identifierref>",
    status: itemRefs.length > 0 ? "pass" : "fail",
  })

  const resourceTags = Array.from(xml.matchAll(/<resource\b[^>]*>/gi)).map((m) => m[0])
  const resources = resourceTags.map((t) => ({
    id: attr(t, "identifier"),
    type: attr(t, "type"),
    scormType: attr(t, "adlcp:scormtype") ?? attr(t, "adlcp:scormType"),
    href: attr(t, "href"),
  }))
  const unresolved = itemRefs.filter((ref) => !resources.some((r) => r.id === ref))
  add({
    id: "manifest.itemref",
    label: "Every item identifierref resolves to a <resource>",
    status: unresolved.length === 0 ? "pass" : "fail",
    detail: unresolved.length ? `Unresolved: ${unresolved.join(", ")}` : undefined,
  })

  const sco = resources.find((r) => itemRefs.includes(r.id ?? ""))
  add({
    id: "resource.sco",
    label: 'Launch resource is type="webcontent" adlcp:scormtype="sco"',
    status: sco && sco.type === "webcontent" && (sco.scormType ?? "").toLowerCase() === "sco" ? "pass" : "fail",
    detail: sco ? `type=${sco.type} scormtype=${sco.scormType}` : "No SCO resource",
  })

  launchFile = sco?.href ?? null
  const launchExists = Boolean(launchFile && paths.has(launchFile))
  add({
    id: "resource.href",
    label: "Resource href points to an existing launch file",
    status: launchExists ? "pass" : "fail",
    detail: launchFile ?? "href missing",
  })

  // 7. Every <file href> exists; every non-manifest file is listed (warn)
  const fileRefs = Array.from(xml.matchAll(/<file\b[^>]*>/gi)).map((m) => attr(m[0], "href")).filter(Boolean) as string[]
  const missing = fileRefs.filter((f) => !paths.has(f))
  add({
    id: "resource.files",
    label: "All <file href> entries exist in the package",
    status: missing.length === 0 ? "pass" : "fail",
    detail: missing.length ? `Missing: ${missing.slice(0, 5).join(", ")}` : `${fileRefs.length} files verified`,
  })
  const unlisted = Array.from(paths).filter((p) => p !== "imsmanifest.xml" && !fileRefs.includes(p))
  add({
    id: "resource.unlisted",
    label: "All package files are declared in the manifest",
    status: unlisted.length === 0 ? "pass" : "warn",
    detail: unlisted.length ? `Undeclared: ${unlisted.slice(0, 5).join(", ")}` : undefined,
  })

  // 8. Mastery score range
  const mastery = /<adlcp:masteryscore>\s*(\d+)\s*<\/adlcp:masteryscore>/i.exec(xml)
  if (mastery) {
    const n = Number(mastery[1])
    add({
      id: "manifest.masteryscore",
      label: "adlcp:masteryscore within 0–100",
      status: n >= 0 && n <= 100 ? "pass" : "fail",
      detail: mastery[1],
    })
  }

  // 9. Run-time API usage in the launch file
  const launch = launchFile ? byPath.get(launchFile) : undefined
  if (launch) {
    const html = text(launch.data)
    const scriptRefs = Array.from(html.matchAll(/<script\b[^>]*src\s*=\s*"([^"]+)"/gi)).map((m) => m[1])
    const joined = [html, ...scriptRefs.map((s) => (byPath.get(s) ? text(byPath.get(s)!.data) : ""))].join("\n")
    const hasInit = /LMSInitialize\s*\(/.test(joined)
    const hasFinish = /LMSFinish\s*\(/.test(joined)
    const hasStatus = /cmi\.core\.lesson_status/.test(joined)
    const hasScore = /cmi\.core\.score\.raw/.test(joined)
    const hasFind = /\.API\b/.test(joined) && /parent/.test(joined)
    add({
      id: "runtime.api",
      label: "SCO discovers window.API and calls LMSInitialize / LMSFinish",
      status: hasInit && hasFinish && hasFind ? "pass" : "fail",
      detail: `findAPI=${hasFind} LMSInitialize=${hasInit} LMSFinish=${hasFinish}`,
    })
    add({
      id: "runtime.status",
      label: "SCO reports cmi.core.lesson_status and cmi.core.score.raw",
      status: hasStatus && hasScore ? "pass" : "warn",
      detail: `lesson_status=${hasStatus} score.raw=${hasScore}`,
    })
    const external = scriptRefs.filter((s) => /^https?:\/\//i.test(s))
    add({
      id: "runtime.offline",
      label: "No external script dependencies (package runs offline)",
      status: external.length === 0 ? "pass" : "warn",
      detail: external.length ? external.join(", ") : undefined,
    })
    const missingScripts = scriptRefs.filter((s) => !/^https?:/i.test(s) && !paths.has(s))
    add({
      id: "runtime.scripts",
      label: "All local <script src> files are present",
      status: missingScripts.length === 0 ? "pass" : "fail",
      detail: missingScripts.length ? missingScripts.join(", ") : undefined,
    })
  }

  // 10. Browser-safe video
  const videos = files.filter((f) => /\.(mp4|m4v|webm|mov)$/i.test(f.path))
  for (const v of videos) {
    if (typeof v.data === "string") continue
    if (/\.(mp4|m4v)$/i.test(v.path)) {
      const probe = probeMp4(v.data)
      add({
        id: `media.${v.path}`,
        label: `Video ${v.path} is a browser-playable MP4 (H.264)`,
        status: probe.isMp4 && probe.hasAvc1 ? "pass" : probe.isMp4 ? "warn" : "fail",
        detail: probe.isMp4
          ? `brand=${probe.majorBrand} h264=${probe.hasAvc1} hevc=${probe.hasHevc} duration=${probe.durationSeconds ?? "?"}s faststart=${probe.fastStart ?? "?"}`
          : "Not an ISO-BMFF/MP4 container",
      })
      if (probe.fastStart === false) {
        add({
          id: `media.faststart.${v.path}`,
          label: `Video ${v.path} has moov atom before mdat (fast start)`,
          status: "warn",
          detail: "Playback starts only after the whole file downloads. Re-encode with `ffmpeg -movflags +faststart` for instant playback.",
        })
      }
    } else {
      add({
        id: `media.${v.path}`,
        label: `Video ${v.path} container`,
        status: /\.webm$/i.test(v.path) ? "warn" : "warn",
        detail: /\.webm$/i.test(v.path)
          ? "WebM is not supported by Safari — prefer MP4/H.264 for LMS delivery."
          : "QuickTime .mov is not reliably playable in browsers — prefer MP4/H.264.",
      })
    }
  }

  // 11. Size
  const totalBytes = files.reduce((n, f) => n + (typeof f.data === "string" ? Buffer.byteLength(f.data) : f.data.length), 0)
  add({
    id: "package.size",
    label: "Package size is within typical LMS upload limits",
    status: totalBytes <= 500 * 1024 * 1024 ? "pass" : "warn",
    detail: `${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
  })

  return finish(checks, manifestIdentifier, launchFile)
}

function finish(checks: ValidationCheck[], manifestIdentifier: string | null, launchFile: string | null): ValidationReport {
  const summary = { pass: 0, warn: 0, fail: 0 }
  for (const c of checks) summary[c.status]++
  return {
    ok: summary.fail === 0,
    version: "SCORM_1_2",
    checks,
    summary,
    manifestIdentifier,
    launchFile,
  }
}
