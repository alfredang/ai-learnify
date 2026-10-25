# CLAUDE.md — IESA LMS (Learnify)

Project: [[LEARNIFY-IESA-LMS]] — international, scalable, self-paced LMS. Source spec: `spec.docx` (vault root). Self-paced + asynchronous only — no live classes, no instructor-led, no manual grading.

## Project Overview

IESA LMS is an **international, scalable, self-learning LMS** built as a multi-tenant SaaS platform. It is a heavily customised fork of Learnify (Udemy-clone), reshaped end-to-end against the IESA LMS full product specification.

### Product Objectives (from Spec)

1. Enable **public discovery** of learning content
2. Support **paid courses, programmes** (bundled courses), and **free/complimentary content**
3. Automate **certification** with strict, configurable rules
4. Enforce **transparent revenue sharing** (4-way split: Academy, Developer, Marketer, Platform Support)
5. **Retain learner records permanently** (soft-delete only, no data destruction)
6. Support **Gen-AI-assisted content authoring**

### Learning Model (LOCKED — do not change)

- Self-paced, asynchronous only
- No live classes, no instructor-led sessions, no manual grading
- 90-day access windows per course/programme
- Certification gated by: content completion (>=50%) + assessment pass (>=80%) + survey + before expiry

### User Roles & Governance

| Role | Scope | Core Responsibility |
|------|-------|---------------------|
| **Platform Owner** | Global | Commercial owner, monetisation policy |
| **Platform Support** | Global | Security, uptime, technical support |
| **Academy Admin** | Per-tenant | Organisation / Academy administrator |
| **Course Developer** | Per-tenant | Content creation & maintenance |
| **Marketer / Affiliate** | Per-tenant | Promotion via promo codes |
| **Learner** | Per-tenant | End-user consumer |

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router, Turbopack) | 16 |
| Language | TypeScript (strict mode) | 5.x |
| React | React + React DOM | 19 |
| Database | PostgreSQL (Coolify-managed container in production; 15+ for local dev) | 17 |
| ORM | Prisma | 5.22.0 |
| Auth | NextAuth.js v5 (JWT strategy) | 5.0.0-beta.30 |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) | - |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| Data Fetching | TanStack React Query | 5.x |
| Client State | Zustand | 5.x |
| Payments | Stripe (Checkout + Connect + Webhooks) | 2026-01-28 API |
| Media | Cloudinary (signed uploads) or local disk via `src/lib/storage.ts` | 2.9.0 |
| Rich Text | TipTap | 3.x |
| Drag-and-Drop | dnd-kit | 6.3/10.0 |
| Charts | Recharts | 3.x |
| AI | OpenAI `gpt-6.1-sol` primary + DeepSeek V4.1 Flash fallback — plain `fetch` adapters in `src/lib/ai/providers.ts` (no vendor SDK) | - |
| Email | Resend | - |
| Icons | Lucide React | 0.563.0 |
| Toasts | Sonner | 2.x |
| Deploy | Docker (Next.js standalone, Node 22) on Hostinger VPS via Coolify; Traefik + Let's Encrypt | - |

---

## Commands

```bash
npm run dev          # Start dev server (Next.js + Turbopack)
npm run build        # Prisma generate + Next.js build
npm run start        # Production server
npm run lint         # ESLint
npm run db:push      # Push schema to DB (dev)
npm run db:migrate   # Run Prisma migrations (prod)
npm run db:seed      # Seed database (prisma/seed.ts)
npm run db:studio    # Open Prisma Studio GUI
```

---

## Project Structure

```
src/
  app/
    (auth)/              # Login, register, forgot-password
    (browse)/            # Public catalogue, course detail, search
    (learner)/           # Learner dashboard (spec-aligned)
    (instructor)/        # Course Developer editor, dashboard, SCORM Studio (/instructor/scorm-studio)
    (academy)/           # Academy Admin tenant dashboard
    (marketer)/          # Marketer dashboard
    (platform)/          # Platform Owner + Support dashboards
    (student)/           # Legacy learner pages
    (admin)/             # Legacy admin routes
    api/                 # 50+ REST route.ts files (incl. /api/scorm/jobs, /api/academy/credentials/ai)
    actions/             # Server Actions
    checkout/            # Stripe checkout pages
    uploads/[...path]/   # Serves STORAGE_DIR files with HTTP Range support
    verify/              # Public certificate verification
  components/
    admin/               # Admin-only components
    auth/                # Login/register forms
    courses/             # Course editors, players, quiz builders
      editor-sections/   # Specialized lecture type editors
    layout/              # Header, footer, sidebars, navigation
    shared/              # Reusable (AI assist, audit logs, etc)
    ui/                  # 22 shadcn/ui components
  hooks/                 # Custom React hooks
  lib/                   # Domain logic (33 modules)
    ai/                  # AI Assist orchestration (OpenAI → DeepSeek)
      providers.ts       # Plain fetch adapters: OpenAI Responses API + DeepSeek
      harness/           # Traced agent runner (runner.ts) + scorm-video-agent.ts
    scorm/               # SCORM 1.2 manifest, SCO template, validator, ZIP, mp4 probe
    storage.ts           # Local file storage (STORAGE_DIR) when Cloudinary is absent
    validations/         # Zod schemas (auth, course, user)
  providers/             # Context providers (auth, react-query)
  i18n/                  # Internationalization (en, zh, ms)
  types/                 # TypeScript type definitions
  middleware.ts          # Route protection middleware
prisma/
  schema.prisma          # 1,289 lines, 30+ models, 13 enums
  seed.ts                # Database seeder
  migrations/            # Prisma migrations
docs/                    # 20 markdown files (MkDocs)
scripts/                 # 20 migration/verification utilities
Dockerfile               # Node 22 standalone image (Coolify Dockerfile build pack)
docker-entrypoint.sh     # Runs `prisma migrate deploy`, then starts server.js
```

---

## Architecture & Patterns

### Multi-Tenancy
- Single database, row-level tenancy via `academyId` foreign key
- Platform Owner/Support operate cross-tenant; everyone else is tenant-scoped
- `AcademyMembership` join table: one user can belong to multiple academies with different roles

### Auth Strategy
- **Learners**: email + password ONLY (OAuth blocked per spec section 3.1)
- **Staff roles**: email/username + password, optional Google/GitHub OAuth
- JWT session with `platformRole` + `memberships[]` in token
- Rate-limited login (10 attempts/minute per identifier)

### Data Patterns
- **Server Components by default** — `"use client"` only where interactivity required
- **Direct DB calls in RSCs** — no extra API layer for internal reads
- **Server Actions** for mutations (`"use server"`)
- **React Query** for client-side data (60s staleTime default)
- **Zustand** for UI-only client state

### Financial Model (Immutable Ledger)
- All money moves through append-only `LedgerEntry` rows
- Each purchase creates 5-7 ledger legs under a single `parentTxnId`
- Split: CHARGE -> DISCOUNT -> MARKETER -> PLATFORM_SUPPORT -> TAX -> ACADEMY + DEVELOPER
- Refunds are reversal entries, never updates
- Nightly invariant check: sum per `parentTxnId` must equal zero

### Certification Engine
- Configurable per-academy via `CertificateRule`
- Default: >=50% content + >=80% assessment + survey completed + before access expiry
- Auto-issued on any progress/quiz/survey event that satisfies all rules
- PDF with QR code linking to public `/verify/[certificateId]`

### Content Types
8 lecture types: VIDEO, TEXT, QUIZ, PDF, SCORM, XAPI, VOICE_OVER_SLIDES, DOWNLOADABLE
- Polymorphic `contentPayloadJson` field for type-specific data

---

## Key Domain Modules

| Module | Path | Purpose |
|--------|------|---------|
| Auth | `src/lib/auth.ts` | NextAuth config, JWT callbacks, role resolution |
| Academy | `src/lib/academy.ts` | Academy context loading, role helpers |
| Access | `src/lib/access.ts` | 90-day access grant/expiry enforcement |
| Ledger | `src/lib/ledger.ts` | Double-entry ledger computation (spec section 16) |
| Certification | `src/lib/certification.ts` | Cert eligibility engine (spec section 12-13) |
| Payouts | `src/lib/payouts.ts` | Payout batch generation |
| Checkout | `src/lib/checkout-finalize.ts` | Post-purchase ledger settlement |
| Tax | `src/lib/tax.ts` | Jurisdiction-aware tax calculation |
| AI Assist | `src/lib/ai/assist.ts` | AI Assist orchestration: OpenAI primary → DeepSeek fallback, per-academy credentials, `AiInteraction` logging |
| AI Providers | `src/lib/ai/providers.ts` | Plain `fetch` adapters for OpenAI (`gpt-6.1-sol`, API key or ChatGPT OAuth) and DeepSeek (`deepseek-flash`) |
| Agent Harness | `src/lib/ai/harness/` | Traced step runner (`runner.ts`) + SCORM video agent (`scorm-video-agent.ts`) |
| SCORM | `src/lib/scorm/` | SCORM 1.2 manifest writer, SCO template, conformance validator, ZIP packer, MP4 probe |
| Storage | `src/lib/storage.ts` | Local file storage under `STORAGE_DIR`, served by `/uploads/[...path]` |
| Audit | `src/lib/audit.ts` | Append-only audit logging |
| Feature Flags | `src/lib/feature-flags.ts` | Per-academy feature gating |
| Rate Limit | `src/lib/rate-limit.ts` | In-memory rate limiter |
| Stripe | `src/lib/stripe.ts` | Stripe SDK wrapper |
| Cloudinary | `src/lib/cloudinary.ts` | Media upload management |
| Email | `src/lib/email.ts` | Transactional email (Resend) |
| Invoice | `src/lib/invoice-html.ts` | Invoice PDF generation |

---

## Conventions

### Naming
- **Directories**: kebab-case (`editor-sections/`, `(browse)/`)
- **Components**: PascalCase `.tsx` (`CourseCard.tsx`, `QuizBuilder.tsx`)
- **Utilities/lib**: camelCase `.ts` (`auth.ts`, `ledger.ts`)
- **Pages/routes**: `page.tsx`, `layout.tsx`, `route.ts` (Next.js convention)
- **DB models**: Singular PascalCase (`User`, `Course`, not `Users`)
- **Enums**: UPPER_SNAKE_CASE (`DRAFT`, `PENDING_REVIEW`)

### API Response Format
- **Success**: `{ data: T, meta?: { total, page, pageSize, totalPages } }`
- **Error**: `{ message: string, code?: string }`
- **Pagination**: `ITEMS_PER_PAGE` from `src/lib/constants.ts`

### Validation
- Zod schemas in `src/lib/validations/` (auth.ts, course.ts, user.ts)
- `.safeParse()` in API routes before handler logic

### Path Alias
- `@/*` maps to `./src/*` (tsconfig.json)

---

## Environment Variables

**Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — 32+ char secret (`openssl rand -base64 32`)
- `NEXT_PUBLIC_APP_URL` — Full app URL (also a Docker build arg)
- `AUTH_URL` + `AUTH_TRUST_HOST=true` — required behind the Traefik reverse proxy in production

**Optional (graceful degradation):**
- `STRIPE_*` — Payment processing
- `CLOUDINARY_*` — Media uploads
- `AUTH_GOOGLE_*`, `AUTH_GITHUB_*` — Staff OAuth
- `OPENAI_API_KEY` — AI assist primary (or ChatGPT OAuth: `OPENAI_OAUTH_ACCESS_TOKEN` + optional `OPENAI_OAUTH_REFRESH_TOKEN`, `OPENAI_ACCOUNT_ID`); `OPENAI_MODEL` overrides `gpt-6.1-sol`
- `DEEPSEEK_API_KEY` — automatic fallback provider (`DEEPSEEK_BASE_URL` default `https://api.deepseek.com`, `DEEPSEEK_MODEL` default `deepseek-flash`)
- `CREDENTIAL_ENCRYPTION_KEY` — AES-256-GCM key for per-academy AI credentials (Academy Settings → Integrations → AI Provider)
- `STORAGE_DIR` — local upload/SCORM storage root (default `./storage`; `/app/storage` persistent volume in Docker)
- `RESEND_API_KEY`, `EMAIL_FROM` — Transactional email
- `CRON_SECRET` — Cron job auth

See `.env.example` for full list.

---

## Reusable Utilities (prefer extending over creating new)

- `cn()` in `src/lib/utils.ts` — Tailwind class merging
- `prisma` singleton in `src/lib/prisma.ts`
- `auth()` in `src/lib/auth.ts` — do NOT use `getServerSession`/v4 patterns
- Stripe helpers in `src/lib/stripe.ts` — extend, don't replace
- Zod schemas in `src/lib/validations/` — extend, don't duplicate
- shadcn/ui in `src/components/ui/` — do NOT install competing UI libs
- dnd-kit patterns from CourseContentEditor — reuse for similar UIs
- React Query patterns in `src/providers/` — follow 60s staleTime baseline

---

## Implementation Phases

The project follows a 10-phase roadmap (see `docs/lms-implementation-plan.md`). Status verified against spec `Learninfy-IESA-LMS.MD` on 2026-04-29:

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — Foundation | Done | Dev env, CI, audit plumbing, feature flags |
| 1 — Multi-Tenancy & Roles | Done | 6 roles (`PlatformRole` + `AcademyRole`), Academy model, `AcademyMembership` join table |
| 2 — Public Catalogue | Done | `Banner` model + carousel (≤10 banners), all 4 spec filters & sorts, public detail page, login wall only on Join/Enrol |
| 3 — Content Model | Done | E-Courses, Programmes (≥2 courses, shared 90-day window), Complimentary Programme (sentinel access grant) |
| 4 — Payments & Ledger | Done | Stripe checkout → webhook → finalize, immutable `LedgerEntry`, promo codes, invoices (post-payment only), refund reversal, payout batches, nightly invariant cron |
| 5 — Certification & Survey | Done | Auto-issued certs gated on ≥50%/≥80%/survey/before-expiry, configurable per academy via `CertificateRule`, public `/verify/[id]` with QR |
| 6 — Advanced Authoring | Done | All 8 lecture types (VIDEO/TEXT/QUIZ/PDF/SCORM/XAPI/VOICE_OVER_SLIDES/DOWNLOADABLE + HTML), drag-and-drop course & programme builders, `CourseVersion` snapshots |
| 7 — Gen-AI | Done | AI Assist via OpenAI `gpt-6.1-sol` with automatic DeepSeek V4.1 Flash fallback (drafts only, `approved=false` until author signs off), licence-free media curation (Openverse + Wikimedia), per-tenant `aiEnabled` toggle + encrypted per-academy credentials, `AiInteraction` audit log, SCORM Studio agent harness |
| 8 — Role Dashboards | Done | All 6 role dashboards functional: Learner, Course Developer, Academy Admin, Marketer, Platform Owner, Platform Support |
| 9 — i18n / Tax / Compliance | Partial | Tax (`TaxRate`, jurisdiction-aware invoices) + multi-currency (SGD default) done; i18n is client-side bundles only — no server-side locale routing yet |
| 10 — Hardening | Partial | Security headers, rate limiting, audit, GDPR data export done; locked-rules guard for Platform Owner missing; load testing pending |

---

## Key Features (Verified Against Spec)

### Authentication & Roles
- 6-role model: `PLATFORM_OWNER`, `PLATFORM_SUPPORT` (platform-wide) + `ACADEMY_ADMIN`, `COURSE_DEVELOPER`, `MARKETER`, `LEARNER` (per-tenant via `AcademyMembership`)
- Learner auth: email + password ONLY (OAuth blocked at runtime in `src/lib/auth.ts:113-125`)
- Staff auth: username OR email + optional Google/GitHub OAuth; usernames system-wide unique, never displayed publicly
- Rate-limited login (10 attempts/min per identifier)
- Legacy `UserRole` enum (STUDENT/INSTRUCTOR/ADMIN) still coexists in schema — new code must use `memberships[]`, not `session.user.role`

### Public Catalogue
- Fixed branding banner + advertising carousel (≤10 banners, admin-configurable rotation via `Academy.bannerRotationMs`)
- Course/programme cards: thumbnail, title, partner, blurb, fee or "Complimentary", CPD badge
- Filters: Sector · CPD · Course/Programme · Price · Partner
- Sorts: Newest · Alphabetical · Partner · CPD points
- Login required only on Join/Enrol click

### Learner Experience
- Registration captures: Email, Password, Name to be Called, Certificate Name, optional Certificate ID
- Dashboard tabs: Complimentary · My Courses · My Programmes · Certificates · Invoices & Receipts · Profile
- Complimentary Programme auto-granted on registration (no expiry, no cert, no revenue split)
- Soft-delete only — `User.isActive = false` + `deactivatedAt` (records retained indefinitely)

### Content & Authoring
- 8 lecture types via polymorphic `Lecture.contentPayloadJson`: VIDEO, TEXT, QUIZ, PDF, SCORM 1.2/2004, xAPI, VOICE_OVER_SLIDES, DOWNLOADABLE
- Drag-and-drop course builder (`CourseContentEditor`) and programme builder (`programmes-manager.tsx`)
- Voice-over slides: PPT/PPTX/PDF upload, per-slide voice-over text, no audio required, counts toward content completion
- Quiz types: MCQ, multi-select, true/false, drag-and-drop (auto-graded only)
- Defaults: 80% pass mark, unlimited retakes (`-1`)
- Mandatory completion-based survey (does not affect score; required for cert)
- `CourseVersion` snapshots on every publish

#### SCORM Studio (`/instructor/scorm-studio`)
- Course Developer uploads a lecture video (MP4/H.264 recommended, up to 500MB) plus a brief/transcript
- Agent harness (`src/lib/ai/harness/runner.ts` + `scorm-video-agent.ts`) runs traced steps: probe video → AI learning design (OpenAI → DeepSeek, self-repair, template fallback) → review → render SCO (`index.html` + `scripts/scorm_api.js`) → write `imsmanifest.xml` → SCORM 1.2 conformance validation (manifest schema/version/namespaces, resource & file integrity, run-time API usage, browser-safe video, size) → publish
- Output: unpacked package + ZIP under `/uploads/scorm/<jobId>/`; optional one-click attach as a SCORM lecture
- Jobs stored in `ScormBuildJob`; API: `POST /api/scorm/jobs` (multipart), `GET /api/scorm/jobs`, `GET /api/scorm/jobs/[id]`, `POST /api/scorm/jobs/[id]/attach`
- Modelled on https://github.com/alfredang/workplacesafety-scorm

### Gen-AI Authoring (OpenAI + DeepSeek)
- Providers: OpenAI `gpt-6.1-sol` primary, DeepSeek V4.1 Flash (`deepseek-flash`) automatic fallback — plain `fetch` adapters in `src/lib/ai/providers.ts`, no vendor SDK
- Credentials: global env (`OPENAI_API_KEY` or ChatGPT OAuth vars, `DEEPSEEK_API_KEY`) or per-academy via Academy Settings → Integrations → AI Provider (`/api/academy/credentials/ai`), stored encrypted with `CREDENTIAL_ENCRYPTION_KEY`; accepts an OpenAI API key, a ChatGPT OAuth access token, or the `tokens` JSON block from `~/.codex/auth.json`
- AI assists drafts only: outlines, learning objectives, voice-over text, quizzes, metadata, summaries
- All AI calls write `AiInteraction` rows with `approved=false` until author explicit approval
- Licence-free media curation (Openverse + Wikimedia); `Resource.license/licenseUrl/attribution/sourceProvider` stored
- Per-tenant `Academy.aiEnabled` toggle
- No external model training; author IP preserved

### Payments, Ledger, Payouts
- Stripe Checkout → webhook → `finalizePurchase()` → `grantCourseAccess()`
- Invoice + receipt PDF auto-generated AFTER payment, emailed via Resend, permanently stored (no pre-payment invoices)
- 90-day access from payment timestamp (server-enforced in `src/lib/access.ts`); programmes use ONE shared window
- Reminder emails: end of Month 1, end of Month 2, 2 weeks before expiry (`/api/cron/access-reminders`)
- LOCKED revenue split order: Marketer Commission → Platform Support fixed fee → Learner discount % → remaining 50/50 (default) Academy/Partner
- Immutable `LedgerEntry` (append-only); refunds emit `REFUND_*` reversal entries via `reverseLedger()`
- Nightly invariant check: sum per `parentTxnId` must equal zero (`/api/cron/ledger-invariant`)
- Payout batches: organisation, partner-grouped, marketer, platform support; period-selectable

### Certification
- Default rules (configurable per academy via `CertificateRule`): ≥50% content + ≥80% assessment + survey done + before expiry
- Auto-issued only — never manual
- PDF cert with up to 2 logos, Name to be Called, course title, date, CPD name & value, optional ID, QR code
- Public verify page at `/verify/[certificateId]`

### Internationalisation & Compliance
- Multi-currency with SGD as default (`src/lib/currency.ts`)
- Tax: `TaxRate` per jurisdiction, `Invoice.taxJurisdiction`, `Academy.taxRegistrationNumber`
- Translation bundles (en/zh/ms/th/vi) — client-side only, server-side i18n routing not yet wired
- bcrypt password hashing, JWT sessions, audit logs, GDPR data export at `/api/profile/export`

---

## Known Gaps & Deviations (vs Spec)

These are tracked for future work — see audit findings for full evidence.

### Spec violations to fix
1. `src/lib/checkout-finalize.ts:97-103` updates `LedgerEntry.metadata` after creation (violates append-only). Move Stripe IDs into the initial `writeLedger()` call.
2. `src/app/api/courses/[id]/route.ts:396` hard-deletes DRAFT courses. Replace with `status="ARCHIVED"` + `deletedAt` soft-delete.
3. `src/app/api/academy/programmes/[id]/route.ts:157` hard-deletes Programmes without checking `AccessGrant` references. Archive instead.
4. `src/app/api/courses/[id]/survey/route.ts:159` hard-deletes Survey rows, cascade-deleting `SurveyResponse` audit trail. Soft-disable instead.
5. Cert engine in `src/lib/certification.ts:133` short-circuits on `course.isFree` BEFORE checking programme grant — paid programme containing free-standing courses can't issue per-course certs (spec §6.3 requires per-course certs in programmes).

### Missing features
- **Platform Owner locked-rules guard** — spec §6 walkthrough explicitly forbids Platform Owner from modifying learning model or certification logic; no enforcement exists.
- **Survey public display toggle** — spec §7.4 says "optional public display in the course"; `Survey` model has no `showRatingPublicly` field.
- **Payout payment-request form** — spec §4 walkthrough step 7 requires a customisable form to raise payment with status tracking; only batch records exist today.
- **Server-side i18n routing** — `src/lib/i18n.ts` is a scaffold; no `next-intl` middleware or `/[locale]/` URL routing.
- **Ledger DB-level immutability** — only application-level append-only; no Postgres RULE/RLS preventing UPDATE/DELETE on `LedgerEntry`.

---

## Critical Rules

1. **Ledger is append-only** — never UPDATE or DELETE a `LedgerEntry`. Corrections are reversal entries via `reverseLedger()`.
2. **Learning model is locked** — self-paced, async, no live classes, no manual grading. Do not add features that violate this.
3. **Learners cannot use OAuth** — spec section 3.1 requires email+password only for learners.
4. **90-day access is server-enforced** — never rely on UI-only enforcement.
5. **All AI output requires author approval** — never auto-publish AI-generated content. `AiInteraction.approved=false` by default.
6. **Audit every write operation** — call `audit()` from `src/lib/audit.ts` on all mutations.
7. **Soft-delete only** — never hard-delete user data. Use `isActive = false` + `deactivatedAt`. Same applies to Course, Programme, Survey, Certificate.
8. **Tenant scoping** — every query on tenant-owned data must include `where: { academyId }`. There is no DB-level RLS yet.
9. **Locked rules** — Platform Owner can configure fees/splits/promo codes but MUST NOT be allowed to change cert thresholds or learning model defaults.
10. **Revenue split order is locked** — Marketer → Platform Support fixed fee → Learner discount → remaining 50/50 Academy/Partner. Do not reorder.
