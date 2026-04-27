import type { MembershipSummary } from "@/lib/academy"
import type { PlatformRole } from "@prisma/client"

/**
 * Phase 8: given a user's role context, return the path they should land on
 * after login. Priority: PLATFORM_SUPPORT → /platform/ops; PLATFORM_OWNER →
 * /platform; ACADEMY_ADMIN → /academy; MARKETER → /marketer;
 * COURSE_DEVELOPER → /instructor (unchanged route group); LEARNER → /learner.
 */
export function pickLandingRoute(ctx: {
  platformRole: PlatformRole
  memberships: MembershipSummary[]
}): string {
  if (ctx.platformRole === "PLATFORM_SUPPORT") return "/platform/ops"
  if (ctx.platformRole === "PLATFORM_OWNER") return "/platform"
  if (ctx.memberships.some((m) => m.role === "ACADEMY_ADMIN")) return "/academy"
  if (ctx.memberships.some((m) => m.role === "COURSE_DEVELOPER")) return "/instructor"
  if (ctx.memberships.some((m) => m.role === "MARKETER")) return "/marketer"
  return "/learner"
}

export const ROLE_PATHS = {
  LEARNER: "/learner",
  COURSE_DEVELOPER: "/instructor",
  MARKETER: "/marketer",
  ACADEMY_ADMIN: "/academy",
  PLATFORM_OWNER: "/platform",
  PLATFORM_SUPPORT: "/platform/ops",
} as const
