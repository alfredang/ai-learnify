/**
 * Spec §1.2 + §6 walkthrough — locked rules.
 *
 * Some product invariants are hard-locked by the IESA LMS specification.
 * They cannot be overridden by Academy Admin, Course Developer, Marketer,
 * Platform Support, OR Platform Owner. Their purpose is to keep the
 * platform's contract with learners and partners stable across tenants.
 *
 * This module is the single source of truth for those invariants. Code
 * paths that touch governance settings should import the constants below
 * instead of redefining them, and call the `assert*` helpers when
 * validating inputs from administrative UIs.
 */

/**
 * The learning model itself (spec §1.2). These are FEATURE ABSENCES — the
 * platform must never grow code paths that violate them, regardless of who
 * configures the academy. Documented here so the locked-rules guard has
 * something concrete to reference and so future contributors see them
 * before they wire up "live class" or "manual grading" features.
 */
export const LEARNING_MODEL_LOCKED = Object.freeze({
  selfPacedOnly: true,
  asynchronousOnly: true,
  noLiveClasses: true,
  noInstructorLedSessions: true,
  noManualGrading: true,
} as const)

/**
 * Spec §11 access duration is locked at 90 days from payment. Programmes
 * use a single shared 90-day window. Reminder emails fire at end of M1,
 * end of M2, and 14 days before expiry.
 */
export const ACCESS_WINDOW_LOCKED = Object.freeze({
  durationDays: 90,
  programmeUsesSharedWindow: true,
  reminderOffsetDays: [30, 60, 76] as const, // sent on day N from grant
} as const)

/**
 * Spec §12 — default certification gates. These are *defaults*; per-academy
 * `CertificateRule` rows may override the four numeric/boolean values, but
 * the four-gate STRUCTURE (content + assessment + survey + before-expiry)
 * is locked and cannot be removed.
 */
export const CERT_DEFAULTS_LOCKED = Object.freeze({
  minContentPct: 50,
  minAssessmentPct: 80,
  requiresSurvey: true,
  mustBeBeforeExpiry: true,
} as const)

/**
 * Spec §15 — revenue split distribution order is LOCKED. Code paths that
 * compute splits MUST apply them in this order: marketer → platform support
 * fixed fee → learner discount → remaining 50/50 (default) academy/partner.
 * `src/lib/ledger.ts:computeLegs` is the canonical implementation.
 */
export const REVENUE_SPLIT_ORDER_LOCKED = [
  "MARKETER_COMMISSION",
  "PLATFORM_SUPPORT_FIXED_FEE",
  "LEARNER_DISCOUNT",
  "REMAINING_ACADEMY_AND_PARTNER",
] as const

/**
 * Spec §6 walkthrough — the Platform Owner cannot modify locked rules
 * (learning model, certification logic). Use this guard at the top of any
 * endpoint that lets the Platform Owner write governance settings; if the
 * incoming patch attempts to touch a locked-rules field, throw early so
 * the request never reaches the database layer.
 *
 * Returns null if the patch is safe; otherwise returns a violation object
 * with the offending field and reason for inclusion in the API response.
 */
export function detectLockedFieldViolation(
  patch: Record<string, unknown>
): { field: string; reason: string } | null {
  const forbidden: Record<string, string> = {
    // Learning model — must never appear in any patch payload.
    enableLiveClasses: "Spec §1.2 prohibits live classes.",
    enableInstructorLedSessions: "Spec §1.2 prohibits instructor-led sessions.",
    enableManualGrading: "Spec §1.2 requires auto-graded assessments only.",

    // Access window — globally locked at 90 days.
    globalAccessDurationDays: "Spec §11 locks the access window at 90 days.",

    // Certification structural gates — defaults configurable per academy,
    // but the four-gate structure cannot be removed.
    removeContentGate: "Spec §12 requires the content-completion gate.",
    removeAssessmentGate: "Spec §12 requires the assessment-score gate.",
    removeSurveyGate: "Spec §12 requires the survey-completion gate.",
    removeExpiryGate: "Spec §12 requires the before-expiry gate.",
  }

  for (const key of Object.keys(patch)) {
    if (key in forbidden) return { field: key, reason: forbidden[key] }
  }
  return null
}

/**
 * Asserts that a CertificateRule patch keeps the four-gate structure
 * intact. Numeric thresholds can be configured by the academy (spec §12
 * "default-but-configurable") but every academy must retain all four
 * gates. Use in the Academy Admin certificate-rule endpoint.
 */
export function assertCertRuleStructureIntact(rule: {
  requiresSurvey?: boolean
  mustBeBeforeExpiry?: boolean
  minContentPct?: number
  minAssessmentPct?: number
}): { ok: true } | { ok: false; reason: string } {
  if (rule.requiresSurvey === false) {
    // Allowed by the spec? Re-reading §12 — "Survey completed" is one of
    // four required gates. Removing it violates the structure. Reject.
    return {
      ok: false,
      reason:
        "Spec §12 requires the survey gate. Set isActive=false on the survey to skip per-course; do not remove the requirement globally.",
    }
  }
  if (rule.mustBeBeforeExpiry === false) {
    return {
      ok: false,
      reason:
        "Spec §12 requires the before-expiry gate. Certificates cannot issue after the 90-day access window.",
    }
  }
  if (rule.minContentPct !== undefined && (rule.minContentPct < 0 || rule.minContentPct > 100)) {
    return { ok: false, reason: "minContentPct must be between 0 and 100." }
  }
  if (
    rule.minAssessmentPct !== undefined &&
    (rule.minAssessmentPct < 0 || rule.minAssessmentPct > 100)
  ) {
    return { ok: false, reason: "minAssessmentPct must be between 0 and 100." }
  }
  return { ok: true }
}
