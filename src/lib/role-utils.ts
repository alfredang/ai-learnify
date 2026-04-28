export type ViewAsRole =
  | "platform-owner"
  | "platform-support"
  | "academy-admin"
  | "course-developer"
  | "marketer"
  | "learner"

export const VIEW_AS_ROLES: Record<ViewAsRole, { label: string; route: string }> = {
  "platform-owner":   { label: "Platform Owner",       route: "/platform" },
  "platform-support": { label: "Platform Support",     route: "/platform/ops" },
  "academy-admin":    { label: "Academy Admin",        route: "/academy" },
  "course-developer": { label: "Course Developer",     route: "/instructor" },
  "marketer":         { label: "Marketer / Affiliate",  route: "/marketer" },
  "learner":          { label: "Learner",              route: "/learner" },
}

interface MembershipSummary {
  academyId: string
  role: string
}

export function getAvailableRoles(
  platformRole: string,
  memberships: MembershipSummary[],
  legacyRole?: string,
): ViewAsRole[] {
  const roles: ViewAsRole[] = []

  if (platformRole === "PLATFORM_OWNER") roles.push("platform-owner")
  if (platformRole === "PLATFORM_SUPPORT" || platformRole === "PLATFORM_OWNER") roles.push("platform-support")

  const academyRoles = new Set(memberships.map((m) => m.role))

  if (academyRoles.has("ACADEMY_ADMIN") || platformRole === "PLATFORM_OWNER") roles.push("academy-admin")
  if (academyRoles.has("COURSE_DEVELOPER") || legacyRole === "INSTRUCTOR" || legacyRole === "ADMIN") roles.push("course-developer")
  if (academyRoles.has("MARKETER") || platformRole === "PLATFORM_OWNER") roles.push("marketer")

  // Everyone can be a learner
  roles.push("learner")

  return roles
}

export function detectActiveRole(pathname: string): ViewAsRole {
  if (pathname.startsWith("/platform/ops")) return "platform-support"
  if (pathname.startsWith("/platform")) return "platform-owner"
  if (pathname.startsWith("/academy")) return "academy-admin"
  if (pathname.startsWith("/instructor")) return "course-developer"
  if (pathname.startsWith("/marketer")) return "marketer"
  if (pathname.startsWith("/learner")) return "learner"
  if (pathname.startsWith("/admin")) return "platform-owner"
  return "learner"
}
