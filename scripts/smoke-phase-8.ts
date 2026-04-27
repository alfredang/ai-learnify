/**
 * Phase 8 smoke test. For each seeded role (admin / instructor / learner),
 * log in via the credentials provider and hit every role dashboard URL.
 * Confirms:
 *   - Correct roles can reach their own dashboards (200)
 *   - Wrong roles are redirected away (302/307 to /login or /)
 *
 * Uses fetch with a cookie jar simulated via the NextAuth session JWT.
 */

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

async function loginAndGetCookies(email: string, password: string): Promise<string> {
  // Step 1: get csrf token
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`)
  const csrfCookie = csrfRes.headers.get("set-cookie") ?? ""
  const csrfJson = (await csrfRes.json()) as { csrfToken: string }

  // Step 2: POST credentials
  const body = new URLSearchParams({
    email,
    password,
    redirect: "false",
    csrfToken: csrfJson.csrfToken,
    callbackUrl: BASE,
    json: "true",
  })
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookie,
    },
    body,
    redirect: "manual",
  })
  // Concatenate all Set-Cookie headers
  const allCookies = [csrfCookie, loginRes.headers.get("set-cookie") ?? ""]
    .filter(Boolean)
    .join("; ")
  return allCookies
}

async function checkPath(cookie: string, path: string): Promise<number> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  })
  return res.status
}

async function main() {
  const scenarios: Array<{
    email: string
    password: string
    label: string
    expect: Record<string, "allow" | "deny">
  }> = [
    {
      email: "admin@learnify.com",
      password: "password123",
      label: "ADMIN (PLATFORM_OWNER + ACADEMY_ADMIN)",
      expect: {
        "/learner": "allow",
        "/academy": "allow",
        "/platform": "allow",
        "/platform/ops": "allow",
        "/marketer": "allow",
        "/academy/learners": "allow",
        "/academy/courses": "allow",
        "/academy/branding": "allow",
        "/academy/audit": "allow",
        "/academy/settings": "allow",
        "/platform/audit": "allow",
        "/platform/policy": "allow",
      },
    },
    {
      email: "john@learnify.com",
      password: "password123",
      label: "INSTRUCTOR → COURSE_DEVELOPER",
      expect: {
        "/learner": "allow",
        "/academy": "deny",
        "/platform": "deny",
        "/marketer": "deny",
      },
    },
    {
      email: "student1@example.com",
      password: "password123",
      label: "STUDENT → LEARNER",
      expect: {
        "/learner": "allow",
        "/academy": "deny",
        "/platform": "deny",
        "/marketer": "deny",
      },
    },
  ]

  for (const s of scenarios) {
    console.log(`\n=== ${s.label} (${s.email}) ===`)
    const cookie = await loginAndGetCookies(s.email, s.password)
    for (const [path, expected] of Object.entries(s.expect)) {
      const status = await checkPath(cookie, path)
      const ok =
        expected === "allow"
          ? status === 200
          : status === 302 || status === 307 || status === 308
      const marker = ok ? "✓" : "✗"
      console.log(`  ${marker} ${path.padEnd(25)} → ${status}  (expected ${expected})`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
