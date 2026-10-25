# Security Review — Phase 10

Spec §18 "Security & Privacy" compliance walkthrough, tied to the actual code in this repo. Each item has a **status** (Done / Partial / Deferred) and a pointer to the relevant file.

Review this file before every production release. Re-date the header when you do.

**Last reviewed:** 2026-04-24.

---

## OWASP Top 10 (2021) status

| # | Category | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | **Done** | Role gates in [src/middleware.ts](../src/middleware.ts) + per-route `assertAcademyAdmin` / `assertCourseAuthor` helpers. Academy-scoped queries throughout |
| A02 | Cryptographic Failures | **Done** | bcrypt (cost 12) for passwords; JWT sessions via NextAuth; TLS terminated at edge |
| A03 | Injection | **Done** | Prisma parameterised queries only; one `$queryRaw` in [src/lib/ledger.ts](../src/lib/ledger.ts#L306) uses Prisma's tagged-template binding |
| A04 | Insecure Design | **Partial** | Ledger is append-only and double-entry tested; refunds as reversal rows. Full threat model not documented |
| A05 | Security Misconfiguration | **Done** | Security headers in [next.config.ts](../next.config.ts); env validated at boot via [src/lib/env.ts](../src/lib/env.ts) |
| A06 | Vulnerable and Outdated Components | **Partial** | `npm audit` clean at time of review. No automated Dependabot / Renovate yet — Phase 10b |
| A07 | Identification & Authentication Failures | **Done** | Rate-limited login + register; deactivated accounts blocked in authorize callback |
| A08 | Software and Data Integrity | **Partial** | Stripe webhook signature verified; SCORM upload pipeline is Phase 6 deferred |
| A09 | Security Logging & Monitoring | **Done** | `AuditLog` + `audit()` helper called from every mutating write path |
| A10 | Server-Side Request Forgery | **Done** | No user-controlled server-side fetches except Cloudinary uploads (signed URLs) and xAPI LRS ingest (which is inbound only) |

---

## Detailed review

### A01 — Broken Access Control

- **Middleware gating** ([src/middleware.ts](../src/middleware.ts)) rewrites unauthenticated requests to login for every `(learner|academy|marketer|platform)/*` path.
- **Tenant scoping** — every data-plane mutation path (`/api/academy/*`, `/api/courses/*`, `/api/ai/*`) runs an `academyId` / `courseId` → membership check before touching data. Pattern:

  ```ts
  const isOwner = session.user.platformRole === "PLATFORM_OWNER"
  const isMember = session.user.memberships?.some(
    (m) => m.academyId === target.academyId && m.role === "ACADEMY_ADMIN"
  )
  if (!isOwner && !isMember) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  ```
- **Learner-vs-learner isolation** — `/api/profile/export`, progress POSTs, and certificate lookups all scope `userId` to `session.user.id`. No endpoint accepts a target userId from the body.
- **Known gap** — the Udemy-era `/instructor` + `/student` route groups still exist alongside the new IESA ones. Behaviorally harmless (every route has its own auth check) but adds attack surface; schedule their removal in Phase 10b.

### A02 — Cryptographic Failures

- **Password storage** — [src/app/api/auth/register/route.ts](../src/app/api/auth/register/route.ts) uses `bcrypt.hash(password, 12)`. Verification via `bcrypt.compare` in NextAuth `authorize`.
- **Session strategy** — JWT (not database sessions). `AUTH_SECRET` enforced to ≥32 chars by [src/lib/env.ts](../src/lib/env.ts).
- **Audit IP hashing** — [src/lib/audit.ts](../src/lib/audit.ts) hashes IP addresses with SHA-256 + per-deploy salt, then truncates to 32 chars. Raw IPs never hit the database.
- **TLS** — terminated by Traefik on the Coolify host with Let's Encrypt certificates (TLS-ALPN challenge). `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` set in [next.config.ts](../next.config.ts).
- **Not yet** — payment card data (correctly) never touches our servers; handed off to Stripe Checkout.

### A03 — Injection

- **SQL injection** — all ORM calls go through Prisma with parameterised queries. The one `$queryRaw` call in `findUnbalancedTransactions` uses a tagged-template literal, which Prisma binds safely. No string concatenation into queries.
- **Prompt injection (AI Assist, Phase 7)** — the system prompts in [src/lib/ai/prompts.ts](../src/lib/ai/prompts.ts) sit before the user turn and are cached; user input is passed as the `user` role. Outputs are always draft-only and require explicit author approval via `AiInteraction.approved` before they ship.
- **XSS** — React escapes all string interpolation. Invoice HTML rendering in [src/lib/invoice-html.ts](../src/lib/invoice-html.ts) uses a dedicated `escapeHtml` helper. TipTap rich text is sanitized by the editor before save.

### A04 — Insecure Design

- **Ledger as single source of truth** — every money mutation writes an append-only `LedgerEntry` row. Refunds are reversal legs, never updates. Balance invariant tested nightly ([/api/cron/ledger-invariant](../src/app/api/cron/ledger-invariant/route.ts)).
- **Access windows** enforced server-side in [checkCourseAccess](../src/lib/access.ts), not just in UI.
- **Certification engine** ([src/lib/certification.ts](../src/lib/certification.ts)) treats all gates as hard requirements; no manual override path.
- **Threat model document** — not formalised yet. Phase 10b.

### A05 — Security Misconfiguration

- Security headers set in [next.config.ts](../next.config.ts): `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` denying camera/mic/geolocation, HSTS.
- **CSP is deliberately omitted** until Stripe Checkout + Cloudinary widget + next/script allowlists can be validated end-to-end without breaking checkout. Marked TODO in `next.config.ts`.
- Environment validation at boot via [src/lib/env.ts](../src/lib/env.ts). Missing required vars = clear startup error, not a runtime TypeError on first request.
- `.env` files in `.gitignore`. `.env.example` documents every expected key.

### A06 — Vulnerable and Outdated Components

- `npm audit` run at each release; currently clean.
- **Not yet configured:** Dependabot / Renovate for automated dependency upgrades. Phase 10b.
- Prisma 5.22 is currently on a maintenance branch — planned upgrade to Prisma 6 after Phase 10b when the incremental migration is scheduled.

### A07 — Identification & Authentication Failures

- [src/lib/rate-limit.ts](../src/lib/rate-limit.ts) limits auth surfaces:
  - Register: 10/min per IP
  - Credentials sign-in: 10/min per email (email-keyed prevents a compromised IP from locking out an account, and doesn't blanket-block a shared office IP for a single-target attack)
- Deactivated users (`isActive=false`) are blocked in the NextAuth `authorize` callback.
- OAuth providers (Google, GitHub) handle their own credentialing.
- **Known gap** — no TOTP / passkey / MFA. Phase 10b for high-privilege roles (Platform Owner, Academy Admin).

### A08 — Software and Data Integrity

- **Stripe webhook signature** verified in [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts) using `stripe.webhooks.constructEvent(rawBody, signature, secret)`. Replay protection via the Stripe library's timestamp check.
- **Cron authentication** — `/api/cron/*` routes require `Authorization: Bearer $CRON_SECRET` and refuse to run when `CRON_SECRET` is unset. The scheduler (Coolify scheduled task or system cron) must send that header.
- **SCORM upload pipeline** is Phase 6 deferred — authors pre-extract and host externally. When server-side unzip lands in Phase 10b, it must include ClamAV or equivalent scanning before the iframe is ever served.
- **File uploads via Cloudinary signed URLs** — the signature is server-generated and short-lived, so clients can't upload outside their allowed scope.

### A09 — Security Logging & Monitoring

- `audit()` helper called from every mutating write path: auth, checkout, refunds, payouts, promo codes, ledger, AI Assist, course publish, survey submit, assessment attempts, privacy actions.
- Audit entries include action, resource type, resource id, user id, academy id, IP hash, and free-form metadata. No PII in metadata — just ids and counts.
- Retention target: **7 years** (spec §18). Included in the Postgres backup rotation (see runbook §2).
- **Not yet configured:** external error tracking (Sentry). Console.error is the only sink for runtime exceptions. Phase 10b.

### A10 — Server-Side Request Forgery

- No endpoint accepts a URL from the user and fetches it server-side.
- AI Assist calls OpenAI (`https://api.openai.com/v1/responses`) and DeepSeek at fixed endpoints via plain `fetch` adapters in [src/lib/ai/providers.ts](../src/lib/ai/providers.ts). `DEEPSEEK_BASE_URL` is operator-configured env, never user input.
- `/api/xapi/statements` is **inbound only** — we accept statements, we don't follow any URLs they contain.
- Stripe webhooks are signature-verified before any side effects.
- Cloudinary URLs are whitelisted in [next.config.ts](../next.config.ts) `images.remotePatterns`.

---

## Compliance checklist (GDPR / PDPA)

| Control | Spec | Status |
|---|---|---|
| Lawful basis + consent at registration | §3.1 | Done — mandatory cert fields collected explicitly |
| Data access (export) | §18 | Done — [/api/profile/export](../src/app/api/profile/export/route.ts) |
| Right to deletion (soft) | §17, §18 | Done — [/api/profile/deactivate](../src/app/api/profile/deactivate/route.ts) — hard deletion intentionally not offered because audit + financial records must survive |
| Data retention | §17 | Indefinite for learner records; 7y for audit log |
| Encryption in transit | §18 | TLS at edge; HSTS preload |
| Encryption at rest | §18 | Self-hosted PostgreSQL 17 on the Coolify VPS — enable disk encryption on the Hostinger volume; per-academy AI credentials are AES-256-GCM encrypted with `CREDENTIAL_ENCRYPTION_KEY` |
| Breach notification | §18 | No runbook entry yet — Phase 10b |
| Sub-processor list (Stripe, Cloudinary, OpenAI, DeepSeek, Hostinger) | §18 | Maintain in the privacy policy |

---

## Known gaps (Phase 10b backlog)

- [ ] Strict CSP with documented Stripe / Cloudinary / next/script allowlist
- [ ] Dependabot / Renovate for automated dep upgrades
- [ ] MFA for Platform Owner and Academy Admin roles
- [ ] Sentry (or equivalent) for runtime error tracking
- [ ] SCORM zip scanning (ClamAV) before serving the extracted iframe
- [ ] Formal threat model document
- [ ] Breach notification runbook
- [ ] Dependency upgrade plan for Prisma 5 → 6
- [ ] Retire legacy `/instructor` + `/student` route groups once Phase 1e sweep completes
