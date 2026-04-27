# IESA LMS

Self-paced, async-only Learning Management System built on Next.js. Forked from Learnify (Udemy-clone), reshaped end-to-end against the IESA LMS product specification.

> **License:** Proprietary / All Rights Reserved. See `package.json`. This repo is **not** open-source — clone and modification rights are retained by the project owner.

## What this is

A multi-tenant LMS that supports:

- **6 user roles** — Platform Owner · Platform Support · Academy Admin · Course Developer · Marketer · Learner
- **3 content models** — Complimentary Programmes (free, no expiry), E-Courses (paid/free), Programmes (course bundles with one shared 90-day window)
- **8 lecture types** — Video, Text, Quiz, PDF, SCORM 1.2/2004, xAPI, Voice-Over Slides, Downloadable
- **5 quiz question types** — multiple choice, multiple select, true/false, drag-and-drop ordering, open-ended
- **4-way revenue distribution** — Marketer commission → Platform support fixed fee → Discount → Academy/Developer share (default 50/50)
- **Immutable double-entry ledger** — every money movement writes append-only `LedgerEntry` rows; refunds are reversal entries; nightly invariant cron asserts every transaction sums to zero
- **Auto-issued certificates** — gated by ≥50% content + ≥80% assessment + survey + before-expiry; PDF with QR verifier
- **Gen-AI authoring** — per-tenant on/off, author-approval-gated drafts via Anthropic Claude
- **GDPR/PDPA** — JSON data export, soft-deactivation, audit trail with 7-year retention

For the full specification see the IESA LMS spec PDF.

## Tech stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Server Components, Server Actions) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Prisma 5 |
| Auth | NextAuth.js v5 (JWT, email+password for learners; email-or-username for staff) |
| Payments | Stripe Checkout + webhooks |
| Media | Cloudinary (signed uploads) |
| AI | Anthropic Claude (Opus 4.7, prompt-cached) |
| Email | Resend (transactional invoice + reminder emails) |
| UI | Tailwind 4 + shadcn/ui (Radix primitives) |

## Project structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login, register, password reset
│   ├── (browse)/               # Public catalogue, course detail
│   ├── (student)/              # Learner pages (legacy route group)
│   ├── (learner)/              # Learner pages (IESA route group)
│   ├── (instructor)/           # Course Developer editor
│   ├── (academy)/              # Academy Admin tenant area
│   ├── (marketer)/             # Marketer dashboard
│   ├── (platform)/             # Platform Owner / Support
│   └── api/                    # REST endpoints, cron, webhooks, AI, xAPI LRS
├── components/                 # UI components (auth, courses, layout, shared, ui)
├── lib/                        # Domain logic — ledger, payouts, certification,
│                                 access, tax, ai, audit, env, image-hosts
├── i18n/messages/{en,zh,ms}.json
└── types/
prisma/
├── schema.prisma               # Full data model (~30 models, ~10 enums)
└── seed.ts                     # Dev seed — DO NOT RUN IN PROD
docs/
├── lms-implementation-plan.md  # Phase 0–10 roadmap
├── runbook.md                  # Backup/restore + incident response
├── security-review.md          # OWASP top 10 walk-through
└── uat-checklist.md            # End-to-end test script
scripts/
└── seed-filter-coverage.ts     # Idempotent dev tool — populates filters
```

## Quick start

Prereqs: Node 20+, PostgreSQL 15+ (or Neon).

```bash
# 1. Install (postinstall runs `prisma generate`)
npm install

# 2. Configure
cp .env.example .env
# fill in DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL — others optional
# every required value is validated at boot in src/lib/env.ts

# 3. Push schema to DB
npm run db:push          # dev — fast iteration
# OR for production:
# npx prisma migrate deploy

# 4. (Optional, dev only) Seed test data
npm run db:seed
npx tsx scripts/seed-filter-coverage.ts   # adds Sector/CPD/Partner coverage

# 5. Run
npm run dev              # http://localhost:3000
```

## Test accounts (after `npm run db:seed`)

| Email | Role | Password |
|---|---|---|
| `admin@learnify.com` | Platform Owner + Academy Admin | `password123` |
| `john@learnify.com` | Course Developer | `password123` |
| `sarah@learnify.com` | Course Developer | `password123` |
| `student1@example.com` | Learner | `password123` |

> **Do not run `npm run db:seed` against a production database.** Test passwords are visible in `prisma/seed.ts`.

## Optional integrations

Every integration degrades gracefully when env vars are absent. Add as needed:

- `STRIPE_SECRET_KEY` + `STRIPE_PUBLISHABLE_KEY` + `STRIPE_WEBHOOK_SECRET` — paid checkout
- `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` + `NEXT_PUBLIC_CLOUDINARY_*` — file uploads
- `ANTHROPIC_API_KEY` — AI Assist drafting
- `RESEND_API_KEY` + `EMAIL_FROM` — invoice + reminder emails
- `AUTH_GOOGLE_*` / `AUTH_GITHUB_*` — OAuth for staff (learners are email-only per spec §3.1)
- `CRON_SECRET` — protects `/api/cron/*` endpoints

## Health & ops

- `GET /api/health` — liveness + DB ping + integration status
- `GET /api/cron/ledger-invariant` — nightly check; fails the dashboard banner if any transaction doesn't sum to zero
- `GET /api/cron/access-reminders` — sends M1/M2/T-14d reminders when email is configured
- See `docs/runbook.md` for backup/restore procedure and incident playbooks

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build (`prisma generate && next build`) |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply schema to DB (dev only) |
| `npm run db:migrate` | Run Prisma migrations (use this in production) |
| `npm run db:seed` | Seed test data (`tsx prisma/seed.ts`) |
| `npm run db:studio` | Open Prisma Studio GUI |

## Spec compliance

The codebase is audited against every section of the IESA LMS specification. The four learning-model invariants are guarded server-side (no live classes, no instructor-led sessions, no manual grading, no pre-payment invoices) — see `docs/security-review.md` and `docs/uat-checklist.md`.

## Status

- **Phases 0–10** functionally complete
- **Phase 10b backlog** (deferred — listed in `docs/security-review.md`): strict CSP, Dependabot/Renovate, MFA, Sentry, SCORM cmi runtime, full next-intl locale routing, server-side PPT/PPTX conversion, Cloudinary→S3 mirror

## Contributing

This is a closed-source project. External pull requests are not accepted at this time. Internal contributors should branch from `main`, follow the conventions in `docs/contributing.md`, and tick `docs/uat-checklist.md` before merge.
