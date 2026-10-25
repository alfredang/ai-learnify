/**
 * Minimal MP4/ISO-BMFF probe — no ffprobe dependency.
 *
 * Walks the top-level box tree to find `moov/mvhd` and reads the
 * timescale + duration. Also reports the `ftyp` major brand and whether
 * an `avc1` (H.264) sample entry appears, which is the codec every
 * browser can play inside a SCORM iframe.
 */

export type Mp4Probe = {
  isMp4: boolean
  majorBrand: string | null
  durationSeconds: number | null
  hasAvc1: boolean
  hasHevc: boolean
  fastStart: boolean | null
}

function readBoxes(buf: Buffer, start: number, end: number, visit: (type: string, from: number, to: number) => void) {
  let offset = start
  while (offset + 8 <= end) {
    let size = buf.readUInt32BE(offset)
    const type = buf.toString("latin1", offset + 4, offset + 8)
    let header = 8
    if (size === 1) {
      if (offset + 16 > end) break
      const hi = buf.readUInt32BE(offset + 8)
      const lo = buf.readUInt32BE(offset + 12)
      size = hi * 2 ** 32 + lo
      header = 16
    } else if (size === 0) {
      size = end - offset
    }
    if (size < header) break
    visit(type, offset + header, Math.min(end, offset + size))
    offset += size
  }
}

export function probeMp4(buf: Buffer): Mp4Probe {
  const result: Mp4Probe = {
    isMp4: false,
    majorBrand: null,
    durationSeconds: null,
    hasAvc1: false,
    hasHevc: false,
    fastStart: null,
  }
  if (buf.length < 12) return result

  let moovIndex = -1
  let mdatIndex = -1
  readBoxes(buf, 0, buf.length, (type, from, to) => {
    if (type === "ftyp") {
      result.isMp4 = true
      result.majorBrand = buf.toString("latin1", from, Math.min(from + 4, to)).trim()
    } else if (type === "moov") {
      moovIndex = from
      readBoxes(buf, from, to, (inner, ifrom, ito) => {
        if (inner === "mvhd" && ito - ifrom >= 20) {
          const version = buf.readUInt8(ifrom)
          if (version === 1 && ito - ifrom >= 32) {
            const timescale = buf.readUInt32BE(ifrom + 20)
            const hi = buf.readUInt32BE(ifrom + 24)
            const lo = buf.readUInt32BE(ifrom + 28)
            const duration = hi * 2 ** 32 + lo
            if (timescale > 0) result.durationSeconds = duration / timescale
          } else {
            const timescale = buf.readUInt32BE(ifrom + 12)
            const duration = buf.readUInt32BE(ifrom + 16)
            if (timescale > 0) result.durationSeconds = duration / timescale
          }
        }
      })
      // Codec sample entries live deep in moov; a byte scan of the moov
      // box is cheap and good enough to spot avc1 / hvc1 / hev1.
      const moov = buf.subarray(from, to)
      result.hasAvc1 = moov.includes("avc1")
      result.hasHevc = moov.includes("hvc1") || moov.includes("hev1")
    } else if (type === "mdat" && mdatIndex === -1) {
      mdatIndex = from
    }
  })

  if (moovIndex >= 0 && mdatIndex >= 0) result.fastStart = moovIndex < mdatIndex
  if (result.durationSeconds !== null) {
    result.durationSeconds = Math.round(result.durationSeconds * 100) / 100
  }
  return result
}
