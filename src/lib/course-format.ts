/**
 * Display helpers shared by the catalogue, course detail, enrolment and
 * learner pages so the same numbers read the same way everywhere.
 */

/** "1 lecture" / "4 lectures" */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? singular : pluralForm}`
}

/** Total length for course summaries: "2h 05m", "12m", "45s". */
export function formatTotalLength(seconds: number): string {
  if (!seconds || seconds <= 0) return "0m"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m`
  if (m > 0) return `${m}m`
  return `${Math.round(seconds)}s`
}

/** Clock-style lecture length: "4:07", "1:02:30". */
export function formatClock(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ""
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ss = s.toString().padStart(2, "0")
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

/** "ALL_LEVELS" → "All levels" */
export function formatLevel(level: string | null | undefined): string {
  if (!level) return "All levels"
  const s = level.replace(/_/g, " ").toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export const LECTURE_TYPE_LABEL: Record<string, string> = {
  VIDEO: "Video",
  TEXT: "Reading",
  QUIZ: "Quiz",
  PDF: "PDF",
  SCORM: "Interactive module",
  XAPI: "Interactive module",
  VOICE_OVER_SLIDES: "Narrated slides",
  DOWNLOADABLE: "Resources",
  HTML: "Interactive page",
}

/** Access-window copy that matches the server-enforced grant. */
export function accessLabel(days: number | null | undefined): string {
  const d = days && days > 0 ? days : 90
  return `${d}-day full access from enrolment`
}
