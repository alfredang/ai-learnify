// Smoke test for the SCORM 1.2 library: render → manifest → validate → zip.
// Run: npx tsx scripts/smoke-scorm.ts
import { renderSco, SCORM_API_JS } from "@/lib/scorm/sco-template"
import { buildManifest } from "@/lib/scorm/manifest"
import { validateScorm12Package } from "@/lib/scorm/validate"
import { zipPackage } from "@/lib/scorm/zip"
import { probeMp4 } from "@/lib/scorm/mp4"
import { scormDesignSchema } from "@/lib/scorm/types"
import { unzipSync } from "fflate"

// Synthetic MP4: ftyp + moov(mvhd v0 timescale 1000 duration 65600, stsd with avc1 marker) + mdat
function box(type: string, payload: Buffer): Buffer {
  const h = Buffer.alloc(8); h.writeUInt32BE(8 + payload.length, 0); h.write(type, 4, "latin1"); return Buffer.concat([h, payload])
}
const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), Buffer.alloc(4), Buffer.from("isomavc1")]))
const mvhdPayload = Buffer.alloc(100); mvhdPayload.writeUInt32BE(1000, 12); mvhdPayload.writeUInt32BE(65600, 16)
const moov = box("moov", Buffer.concat([box("mvhd", mvhdPayload), box("trak", Buffer.from("....avc1....."))]))
const mdat = box("mdat", Buffer.alloc(1024))
const mp4 = Buffer.concat([ftyp, moov, mdat])
console.log("probe:", probeMp4(mp4))

const design = scormDesignSchema.parse({
  title: "Workplace Security Awareness", subtitle: "Demo", lead: "Lead <b>text</b> & more", learningOutcomes: ["Apply access rules", "Report incidents", "Handle info"],
  videoTitle: "Verify. Protect. Report.", videoIntro: "Press play.",
  topics: Array.from({ length: 2 }, (_, i) => ({ title: `Topic ${i + 1}`, lead: "Lead", tiles: [{ heading: "A", body: "b" }, { heading: "C", body: "d" }], bodyHtml: "<h3>x</h3><p>y</p><script>alert(1)</script>", check: { question: "Which option is correct?", options: ["a", "b", "c", "d"], answer: 1, good: "Good.", bad: "Not quite." } })),
  exam: Array.from({ length: 3 }, (_, i) => ({ question: `Exam question ${i + 1}?`, options: ["a", "b", "c", "d"], answer: 0 })),
  passMark: 80,
})
const html = renderSco({ design, videoFile: "media/lesson-video.mp4" })
if (html.includes("<script>alert")) throw new Error("sanitizer failed")
const files = [
  { path: "index.html", data: html },
  { path: "scripts/scorm_api.js", data: SCORM_API_JS },
  { path: "media/lesson-video.mp4", data: mp4 },
]
const manifest = buildManifest({ identifier: "LEARNIFY-TEST-1", title: design.title, launchFile: "index.html", files: files.map(f => f.path), masteryScore: 80 })
files.unshift({ path: "imsmanifest.xml", data: manifest })
const report = validateScorm12Package(files)
console.log("validation ok:", report.ok, report.summary)
for (const c of report.checks) if (c.status !== "pass") console.log("  ", c.status, c.id, c.detail)
const zip = zipPackage(files)
const entries = Object.keys(unzipSync(new Uint8Array(zip)))
console.log("zip bytes:", zip.length, "entries:", entries)
if (!entries.includes("imsmanifest.xml")) throw new Error("manifest not at zip root")
// negative test: broken manifest
const bad = validateScorm12Package([{ path: "imsmanifest.xml", data: manifest.replace("1.2", "2004 4th") }, ...files.slice(1)])
console.log("negative test fails as expected:", !bad.ok)
