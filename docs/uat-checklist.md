# UAT Checklist

End-to-end acceptance test script. Run against staging before every production cut; run against production as a smoke after deploy.

Pre-reqs: a clean test academy (created via seed or admin flow), one test learner account, one test Academy Admin, one Course Developer, one Marketer, Stripe test keys, an OpenAI API key (or ChatGPT OAuth token) and optionally a DeepSeek API key if AI flows are enabled.

---

## Phase 0 — environment check

- [ ] `GET /api/health` returns 200 with `db.ok: true`
- [ ] `integrations` shows `stripe: true`, `cloudinary: true` (and `openai: true` / `deepseek: true` if AI is enabled)
- [ ] `npm run build` succeeds locally
- [ ] `AUTH_SECRET` length ≥ 32; `NEXT_PUBLIC_APP_URL` points at the deployed origin

## Phase 1 — registration + roles

- [ ] Register a new learner with **Name to be called** + **Certificate name** + optional **ID number** — all three saved
- [ ] Reject registration with mismatched email / weak password — server returns validation errors
- [ ] Trigger register 11 times in one minute from the same IP — 11th returns 429 with `Retry-After`
- [ ] Platform Owner can view their platform dashboard; a plain learner cannot (middleware redirects)
- [ ] Academy Admin for Academy A cannot view Academy B's finance page (403)

## Phase 2 — public catalogue

- [ ] `/` loads without auth and shows the Branding Banner + Advertising Banner Carousel
- [ ] Catalogue filters (Sector, CPD, Course/Programme, Price, Partner) apply correctly
- [ ] Sort by Newest / Alphabetical / Partner / CPD points each re-orders the grid
- [ ] Course detail page is readable without login; clicking "Join / Enrol" redirects to login

## Phase 3 — content + access windows

- [ ] Complimentary programme appears automatically on every new learner dashboard
- [ ] Paid course enrolment starts a 90-day `AccessGrant`; `expiresAt` ≈ now + 90d
- [ ] Programme purchase creates **one** shared `AccessGrant` covering every bundled course
- [ ] Setting the system clock forward past `expiresAt` → lecture viewer shows locked state and progress POST returns 410

## Phase 4 — payments + ledger + payouts

- [ ] Apply a promo code at checkout → quote shows discount and tax line items
- [ ] Complete a Stripe test purchase → webhook fires → `LedgerEntry` rows sum to 0 for the `parentTxnId`
- [ ] Invoice PDF downloadable from the learner's Invoices tab; total matches the quote
- [ ] Academy Admin generates a DRAFT payout batch for the MARKETER group → approve → mark paid with a processor reference; status badges update
- [ ] Issue a refund → reversal entries written; original `AccessGrant` revoked; batch pool sums adjust
- [ ] Nightly ledger invariant cron (`/api/cron/ledger-invariant`) reports 0 unbalanced txns
- [ ] Reminder cron logs entries for grants hitting M1, M2, T-14d windows

## Phase 5 — certification + survey

- [ ] Course Developer drafts a survey with 3 mixed-type questions; autosave works
- [ ] Learner completes ≥50% content (default rule) → takes quiz, scores ≥80% → submits survey → cert auto-issues
- [ ] Cert visible on learner Certificates tab; PDF downloads; QR code on the cert resolves to `/verify/[certificateId]` and shows the issue detail publicly
- [ ] Certificate still reachable after `AccessGrant` expires

## Phase 6 — advanced content types

- [ ] Author creates a **PDF** lecture with a Cloudinary-hosted PDF URL in the content payload; learner viewer renders it in an iframe
- [ ] Author creates a **Voice-over slides** lecture with per-page VO text; learner can page through, read-aloud button speaks the current slide, completion fires after every slide visited
- [ ] Author creates a **Downloadable** lecture with 2 file links; learner downloads both and marks complete
- [ ] SCORM lecture renders in sandboxed iframe (manual completion — full cmi runtime is deferred)
- [ ] `POST /api/xapi/statements` accepts a valid xAPI 1.0.3 statement and returns its id
- [ ] Publishing a course creates a `CourseVersion` snapshot

## Phase 7 — Gen-AI Assist

- [ ] Academy Admin toggles `aiEnabled=true` (via Prisma Studio until the UI ships)
- [ ] AI Assist dialog on the landing-page editor returns a valid metadata JSON draft; "Use this draft" populates the form
- [ ] AI Assist on Intended Learners appends 4–7 objectives to the list
- [ ] `AiInteraction` row written per call; `approved=true` set when draft accepted
- [ ] With `aiEnabled=false`, the API returns 409 with a clear message

## Phase 8 — role dashboards

- [ ] Learner `/learner/profile` edit form saves all four identity fields; toast confirms
- [ ] Marketer dashboard shows real conversion / commission numbers once a promo code purchase clears
- [ ] Platform Owner dashboard shows global revenue, paid vs pending payout totals, unbalanced-ledger banner if any

## Phase 9 — compliance + i18n + tax

- [ ] `/learner/privacy` downloads a JSON export containing profile + certificates + purchases + invoices
- [ ] Deactivation flow requires email-match; after submit, sign-in is blocked
- [ ] Setting an Academy's `taxJurisdiction` + creating an active `TaxRate` → tax line appears on quotes and invoices with the correct label (GST / VAT / Sales Tax)
- [ ] Multi-currency: course with `currency: "SGD"` → quote returns SGD; Stripe Checkout session opens in SGD

## Phase 10 — hardening

- [ ] Security headers present on every response (`curl -I` to confirm `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`)
- [ ] `/api/health` returns 503 if DB is unreachable (simulate by temporarily breaking `DATABASE_URL`)
- [ ] Manual backup + restore drill (see `docs/runbook.md` §2) — restored ledger still balances
- [ ] Platform Owner dashboard's "unbalanced transactions" banner triggers if you artificially corrupt a ledger row (then revert)

---

## Sign-off

Once every box is checked against staging:

- [ ] Tester: ___________________
- [ ] Date: ____________________
- [ ] Commit sha tested: ________

Keep a history of filled-in copies under `docs/qa/phase-N-MM-YYYY.md` for audit purposes.
