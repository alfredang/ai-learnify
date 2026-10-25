# IESA LMS — Implementation Plan

Mapping the IESA LMS full product specification onto the current Learnify codebase and a phased roadmap to implement every requirement.

---

## 1. Context

- **Current system** — Learnify: a Udemy-clone with 3 roles (STUDENT / INSTRUCTOR / ADMIN), single-tenant, lifetime enrolments, 70/30 revenue split, Stripe checkout, Cloudinary media, NextAuth v5, Prisma/Postgres.
- **Target system** — IESA LMS: an international, multi-tenant, self-paced LMS with 6 roles, Programmes (course bundles), Complimentary content, 90-day access, 4-way revenue splits, SCORM/xAPI/voice-over-slide support, Gen-AI authoring, customisable certification, immutable ledger, GDPR/PDPA compliance, and multi-language / multi-currency.
- **Intended outcome** — A clear, phased, incrementally-shippable plan so engineering can start building without re-reading the spec. Each phase produces working functionality and is independently deployable.

The plan assumes the existing Learnify codebase is the starting point and extends it rather than rewriting from scratch.

---

## 2. Spec-to-Codebase Gap Analysis

| Spec Area | Exists Today | Gap |
|---|---|---|
| Roles | 3 (STUDENT/INSTRUCTOR/ADMIN) | Need 6: Learner, Course Developer, Academy Admin, Marketer, Platform Owner, Platform Support |
| Multi-tenancy | None | Need `Academy`/tenant scoping on courses, users, ledger, branding |
| Auth (Learner) | email+pw + Google/GitHub | Learners must be email+pw only; block OAuth for learners |
| Auth (Other roles) | email-only | Add optional username (unique, login-only) |
| User profile | `name`, `headline`, `bio` | Add `nameToBeCalled`, `certificateName`, optional `certificateId` (ID number) |
| Content: Course | [Course](../prisma/schema.prisma#L171) exists | Needs 90-day access, CPD fields, survey flag, SCORM/xAPI/voice-over-slides |
| Content: Programme | None | New `Programme` (≥2 courses, shared 90-day window, one payment) |
| Content: Complimentary Programme | None | Free content, no expiry, no cert, no ledger |
| Lecture types | VIDEO/TEXT/QUIZ | Add SCORM, xAPI, VOICE_OVER_SLIDES, PDF, DOWNLOADABLE |
| Assessments | [Lecture](../prisma/schema.prisma#L254) with QUIZ type + JSON | Add weighted scoring, retake limits, drag-and-drop question type |
| Survey | [Review](../prisma/schema.prisma#L359) (1-5 star + comment) | Distinct from reviews: mandatory completion-based Survey model; 1-5 star aggregates to Academy dashboard |
| Access Duration | Lifetime | 90-day window per course; shared window per Programme; locked-after-expiry enforcement |
| Reminders | None | Cron: End M1, End M2, T-14d emails |
| Certification | `Certificate` auto-issue on 100% progress | Configurable rules (default ≥50% content + ≥80% assessment + survey + before expiry); custom layouts with 2 logos, CPD, QR code |
| Revenue split | 70/30 `instructor/platform` | 4-way: Marketer → Platform Support → Discount → Academy/Developer |
| Promo codes | None | Promo codes tied to marketer commission % and learner discount % |
| Ledger | `Purchase` + `Earning` | Immutable multi-leg `LedgerEntry` with payout groups |
| Payouts | `Earning` with Stripe transfer | Grouped: Academy / partners / marketer / Platform Support; customisable periods |
| Refunds | None | Admin-only manual with ledger reversal |
| Public landing | [homepage](../src/app/page.tsx) with featured courses | Fixed branding banner + up to 10-banner carousel with configurable rotation |
| Catalogue filters | Category/level/price | Add Sector, CPD, Course/Programme, Partner |
| Catalogue sorting | Newest, popular | Add Alphabetical, Partner, CPD points |
| Gen-AI authoring | None | Outlines, objectives, voice-over text, quiz drafts, metadata, summaries; licence-aware media curation |
| i18n | English only | Multi-language UI, UTF-8 names, multi-currency incl. SGD |
| Tax | None | VAT/GST per-jurisdiction, jurisdiction-aware invoices |
| Compliance | Basic | Audit logs, GDPR/PDPA endpoints, encrypted passwords (bcrypt exists), account deactivation (soft) |
| Data retention | Hard delete | Indefinite retention; deactivation-only; historical records always visible to learner |

---

## 3. High-Level Architecture Decisions

1. **Multi-tenancy strategy**: Single database, row-level tenancy via `academyId` foreign key on `User`, `Course`, `Programme`, `LedgerEntry`, `Settings`. Platform Owner / Platform Support operate cross-tenant; everyone else is tenant-scoped.
2. **Role model**: Replace `UserRole` enum with 6 values and add `AcademyMembership` join so a user can belong to multiple academies with different roles. A `PlatformRole` enum on `User` handles global roles (Platform Owner, Platform Support).
3. **Access windows**: Replace lifetime enrolment with `AccessGrant` records that carry `startsAt` / `expiresAt`. Programme purchase creates one shared grant covering every included course.
4. **Ledger as source of truth**: All money moves through append-only `LedgerEntry` rows. Reports/payouts are derived views; refunds are reversal entries, never updates.
5. **Content variants**: Add a polymorphic `ContentItem` layer under `Lecture` so VIDEO / PDF / SCORM / xAPI / VOICE_OVER_SLIDES / DOWNLOADABLE share enrolment/progress plumbing but render differently.
6. **AI provider**: OpenAI `gpt-6.1-sol` as primary with DeepSeek V4.1 Flash as automatic fallback, through plain `fetch` adapters in `src/lib/ai/providers.ts` (no vendor SDK). Wrap calls in a feature-flagged `AiAssistService` with per-tenant on/off, encrypted per-academy credentials and audit logging.
7. **File storage**: Cloudinary for video/image stays. Add S3-compatible storage (or Cloudinary raw) for SCORM `.zip` packages and PPT/PDF uploads; extract client-side for voice-over-slides.

---

## 4. Data Model Changes (Prisma)

New / modified [prisma/schema.prisma](../prisma/schema.prisma) models. Only net changes are listed.

### Enums

```prisma
enum PlatformRole {
  NONE
  PLATFORM_OWNER
  PLATFORM_SUPPORT
}

enum AcademyRole {
  LEARNER
  COURSE_DEVELOPER
  ACADEMY_ADMIN
  MARKETER
}

enum ContentType {
  VIDEO
  TEXT
  QUIZ
  PDF
  SCORM
  XAPI
  VOICE_OVER_SLIDES
  DOWNLOADABLE
}

enum ProductType { COURSE | PROGRAMME | COMPLIMENTARY }
enum LedgerEntryType { CHARGE | DISCOUNT | MARKETER | PLATFORM_SUPPORT | ACADEMY | DEVELOPER | TAX | REFUND }
enum PayoutGroup { ACADEMY | DEVELOPER | MARKETER | PLATFORM_SUPPORT }
enum CertificateRuleStatus { ACTIVE | SUPERSEDED }
enum LanguageCode { EN | ZH | MS | ... }  // stored as String for extensibility
```

### New models

- **Academy** — `id`, `name`, `slug`, `brandingLogoUrl`, `secondaryLogoUrl`, `primaryCurrency`, `taxJurisdiction`, `aiEnabled Boolean`, `cpdUpdateUrl`, timestamps.
- **AcademyMembership** — `userId`, `academyId`, `role AcademyRole`, `@@unique([userId, academyId])`.
- **UserProfile extensions on `User`** — `username String? @unique`, `certificateName String?`, `nameToBeCalled String?`, `certificateIdNumber String?`, `platformRole PlatformRole @default(NONE)`, `isActive Boolean @default(true)`, `deactivatedAt DateTime?`.
- **Programme** — `id`, `academyId`, `title`, `slug`, `price`, `currency`, `isFree`, `status`, `publishedAt`, + relation to `ProgrammeCourse`.
- **ProgrammeCourse** — join `programmeId`, `courseId`, `position`.
- **Banner** — `academyId`, `imageUrl`, `targetUrl`, `position`, `rotationWeight`, `startsAt`, `endsAt`, `isActive`.
- **CpdCatalog** — `academyId`, `sectorId`, `cpdName`, `cpdPoints`, `badgeUrl`. Course links via `cpdCatalogId`.
- **Sector** — `id`, `academyId`, `name`, `slug`.
- **AccessGrant** — `id`, `userId`, `productType`, `courseId?`, `programmeId?`, `grantedAt`, `expiresAt`, `source: "PURCHASE" | "COMPLIMENTARY" | "ADMIN"`, `isActive`.
- **Survey** — `id`, `courseId`, `questionsJson Json`, `isMandatoryForCert Boolean @default(true)`.
- **SurveyResponse** — `id`, `surveyId`, `userId`, `starRating Int`, `answersJson Json`, `submittedAt`. `@@unique([surveyId, userId])`.
- **AssessmentAttempt** — `id`, `lectureId`, `userId`, `score Int`, `maxScore Int`, `passed Boolean`, `answersJson Json`, `attemptNumber`, `submittedAt`.
- **CertificateTemplate** — `academyId`, `layoutJson`, `primaryLogoUrl`, `secondaryLogoUrl`, `fields Json`, `isDefault Boolean`.
- **CertificateRule** — `academyId`, `minContentPct Int @default(50)`, `minAssessmentPct Int @default(80)`, `requiresSurvey Boolean @default(true)`, `mustBeBeforeExpiry Boolean @default(true)`, `status`.
- **PromoCode** — `academyId`, `code @unique`, `marketerUserId?`, `marketerCommissionPct Decimal`, `learnerDiscountPct Decimal`, `validFrom`, `validTo`, `usageLimit`, `usageCount`.
- **LedgerEntry** — `id`, `parentTxnId String` (groups legs of a single sale/refund), `academyId`, `productType`, `productId`, `userId`, `entryType LedgerEntryType`, `amountMinor Int` (cents), `currency`, `payoutGroup PayoutGroup?`, `payoutBatchId?`, `reversalOfId?`, `createdAt`. **No `updatedAt`** — append-only.
- **PayoutBatch** — `id`, `academyId`, `payoutGroup`, `periodStart`, `periodEnd`, `status`, `totalMinor`, `processorRef`.
- **TaxRate** — `academyId`, `jurisdiction`, `rateBps Int`, `appliesFrom DateTime`.
- **AuditLog** — `id`, `userId?`, `academyId?`, `action`, `resourceType`, `resourceId`, `metadataJson`, `ipHash`, `createdAt`.
- **AiInteraction** — `id`, `academyId`, `userId`, `capability`, `promptHash`, `outputHash`, `approved Boolean @default(false)`, `createdAt`. Audit trail for Gen-AI.

### Modified models

- **Course** — add `academyId`, `productType`, `sectorId?`, `cpdCatalogId?`, `partnerName?`, `partnerLogoUrl?`, `surveyId?`, `assessmentPassMark Int @default(80)`, `retakesAllowed Int @default(-1)` (−1 = unlimited), deprecate `isFree` in favour of ProductType.
- **Lecture** — rename `type` from `LectureType` to `ContentType`; add `contentPayloadJson Json?` for SCORM manifest / voice-over-slides sequence.
- **Enrollment** — deprecate; logic moves to `AccessGrant` + `LectureProgress`. Keep as deprecated view for one release then drop.
- **PlatformSettings** — extend: `platformSupportFixedFeeMinor Int`, `defaultAcademyDeveloperSplitBps Int @default(5000)` (50/50), `defaultMarketerCommissionBps Int`.
- **Review** — keep but **retire mandatory role for certification**. Certification now depends on `SurveyResponse`. Reviews stay as public rating.
- **Purchase** — retained as Stripe-session mirror; money truth stays in `LedgerEntry`.

---

## 5. Phased Roadmap

Each phase is independently shippable and built on top of the previous. Testing approach is at the end of the plan and applies across phases.

### Phase 0 — Foundation & Environment (Week 0–1)

- Install Node.js LTS, seed local Postgres (PostgreSQL 17 in production via Coolify), set `.env` per [docs/getting-started/configuration.md](./getting-started/configuration.md).
- Add CI workflow in `.github/workflows/` for typecheck + lint + Prisma validate.
- Introduce feature flags table `FeatureFlag(key, academyId?, enabled)` and a server helper `isEnabled(flag, ctx)`.
- Add an `audit(action, resource, meta)` helper in `src/lib/audit.ts` that writes to `AuditLog`; call it from all write paths from Phase 1 onward.

**Deliverable**: dev environment runs, CI green, audit log plumbing in place.

### Phase 1 — Multi-Tenancy & Role Expansion (Week 1–3)

Establishes the data spine all later phases depend on.

- Migrate schema: add `Academy`, `AcademyMembership`, `PlatformRole` enum, new user fields.
- Data migration script: create a "Default Academy", assign every existing user membership, set old `ADMIN` → `PLATFORM_OWNER`, old `INSTRUCTOR` → `COURSE_DEVELOPER`, old `STUDENT` → `LEARNER`.
- Update [src/lib/auth.ts](../src/lib/auth.ts) callbacks: resolve `academyMemberships` and `platformRole` into the JWT. Add `getCurrentAcademy(req)` helper.
- Update [src/middleware.ts](../src/middleware.ts) to gate routes by (a) `platformRole` for `/platform/*`, (b) academy role for `/academy/*`, `/developer/*`, `/marketer/*`, (c) auth only for `/learner/*`.
- Auth provider split: enforce email+password-only for `LEARNER` sign-ins in [src/components/auth](../src/components/auth/); reject OAuth in the NextAuth `signIn` callback when the target role is learner. OAuth remains available for staff roles.
- Registration UI: add `certificateName`, `nameToBeCalled`, optional `certificateIdNumber`. Update [RegisterForm](../src/components/auth/register-form.tsx) and the [register API](../src/app/api/auth/register/route.ts).
- Replace STUDENT/INSTRUCTOR/ADMIN string checks across the codebase — grep for `"INSTRUCTOR"`, `"ADMIN"` in `src/` and swap for the new role helpers.

**Deliverable**: a user can register as learner, sign in, land on a tenant-scoped dashboard; admin can impersonate different academies.

### Phase 2 — Public Interface & Catalogue Overhaul (Week 3–5)

Delivers the public-facing discovery described in Spec §4.

- New **Branding Banner** (fixed) + **Advertising Banner Carousel** (up to 10, admin-configurable rotation).
  - Model: `Banner` (see §4).
  - Admin UI under Academy Admin: `/academy/branding`.
  - Render in [src/app/layout.tsx](../src/app/layout.tsx) header or a new `(public)` route group.
- Extend catalogue:
  - Replace current filters in [src/lib/constants.ts](../src/lib/constants.ts) and [CourseFilters](../src/components/courses/) with Sector / CPD / Course-or-Programme / Price / Partner.
  - Sorting: Newest, Alphabetical, Partner, CPD points.
  - Card rendering in [CourseCard](../src/components/courses/) gets Partner logo and CPD badge; "Complimentary" label when price is zero and `productType = COMPLIMENTARY`.
- Public detail page: add Learning Objectives, Module Outline, CPD info, Partner info. Keep login-gated "Join / Enrol".
- Add a `Programme` card variant and detail page parallel to Course.

**Deliverable**: Public browses courses + programmes unauthenticated with the spec's filters/sorts; clicking Join triggers login.

### Phase 3 — Content Model: Programmes, Complimentary, Access Windows (Week 5–7)

Core product model change.

- Prisma: `Programme`, `ProgrammeCourse`, `AccessGrant`.
- Programme builder UI (Course Developer + Academy Admin) at `/developer/programmes` using existing [dnd-kit](https://dndkit.com/) drag-and-drop patterns from [CourseContentEditor](../src/components/courses/).
- Complimentary Programme: a dedicated `productType = COMPLIMENTARY` with `AccessGrant` automatically issued on learner registration (via a post-registration hook in the register API).
- Learner dashboard tabs mirroring Spec §5.2:
  - Complimentary Programme
  - My Courses
  - My Programmes
  - Certificates
  - Invoices & Receipts
  - Profile
- Enforce access windows server-side: a `assertActiveAccess(userId, courseId|programmeId)` helper used in:
  - [lecture viewer page](../src/app/(student)/) loader
  - `/api/lectures/[lectureId]/progress`
  - certificate generation
- "Locked content after expiry" UI — render lock state when `AccessGrant.expiresAt < now`.
- Reminder job scaffolding (to be implemented in Phase 4): cron task selecting AccessGrants hitting Month 1 end, Month 2 end, T-14d boundaries.

**Deliverable**: Payment opens a 90-day window; Programme share a single window across ≥2 courses; Complimentary content auto-enrolled for free; expired content is locked.

### Phase 4 — Payment, Ledger, Revenue Split, Promo Codes (Week 7–10)

Spec §10, §14, §15, §16. This is where money mechanics diverge most from the current codebase.

- **Checkout**
  - Extend [src/app/api/checkout/route.ts](../src/app/api/checkout/route.ts) to accept `{ type: "COURSE" | "PROGRAMME", id, promoCode? }`.
  - Validate promo code server-side, compute learner discount, compute Stripe line items.
- **Stripe webhook** [/api/webhooks/stripe](../src/app/api/webhooks/stripe/route.ts):
  - On `checkout.session.completed` — atomically (single Prisma transaction):
    1. Create `Purchase` and `AccessGrant(s)`.
    2. Write 5–7 `LedgerEntry` legs under a single `parentTxnId`: CHARGE (+gross), DISCOUNT (−), MARKETER (−), PLATFORM_SUPPORT (−), TAX (−), ACADEMY (+), DEVELOPER (+).
    3. Enqueue invoice PDF generation.
    4. Call `audit()`.
- **Invoice & receipt**
  - New module `src/lib/invoices.ts` to render PDF (use `pdf-lib` or `@react-pdf/renderer`); store in Cloudinary raw or S3.
  - Jurisdiction-aware numbering + VAT/GST summary derived from `TaxRate`.
  - Email via provider (add Resend/Postmark; free tier acceptable) — add `EMAIL_FROM` env var.
- **Promo codes**
  - CRUD under Academy Admin + Platform Owner.
  - Click-tracking for marketers (`/m/:code` redirect route sets a cookie for attribution on checkout).
- **Refund flow**
  - Admin UI at `/academy/finance/refunds` — creates **reversal** `LedgerEntry` rows; never updates originals. Triggers Stripe refund.
- **Reminder emails** — a Coolify scheduled task (or system cron) calls `/api/cron/access-reminders` with `Authorization: Bearer $CRON_SECRET`. Send at End M1, End M2, T-14d.
- **Academy Admin payout UI** at `/academy/finance/payouts`:
  - Grouped view: Academy / Developers (grouped by partner) / Marketer / Platform Support.
  - Period picker; generate `PayoutBatch`; customisable payment form; status tracking.

**Deliverable**: End-to-end paid purchase with promo code produces a valid ledger, invoice PDF, 90-day grant, and payout-eligible records.

### Phase 5 — Certification & Survey (Week 10–12)

Spec §7.4, §12, §13.

- Replace reliance on `Review` for certification. Introduce `Survey` + `SurveyResponse`; mandatory completion (not score) gates cert.
- Course Developer authoring UI: "Survey" tab in [editor-sections](../src/components/courses/editor-sections/) alongside existing Landing Page / Pricing.
- `AssessmentAttempt` model; rework [quiz-player.tsx](../src/components/courses/) to record attempts, enforce retake limits, store score.
- **Certification engine** (`src/lib/certification.ts`):
  - Inputs: `userId`, `courseId`. Returns `{ eligible, reason }` based on active `CertificateRule` row, content %, best passing `AssessmentAttempt`, `SurveyResponse`, unexpired `AccessGrant`.
  - Called on any progress update, survey submit, and quiz submit. If eligible → create `Certificate`.
- Certificate PDF generator (`src/lib/certificates.ts`):
  - Template from `CertificateTemplate` (2 logos, Name to Be Called, Course title, Completion date, CPD name & value, optional ID, QR code pointing to `/verify/:certificateId`).
  - Reuse PDF pipeline from Phase 4 invoices.
- Public verification route `/verify/[certificateId]`.
- Academy Admin dashboard: aggregated survey star ratings per course.

**Deliverable**: Learner completes content + scores ≥80% on assessment + submits survey within the 90-day window → cert auto-issued with QR, viewable via public verifier.

### Phase 6 — Advanced Authoring: SCORM, xAPI, Voice-Over Slides (Week 12–15)

Spec §7.

- **SCORM 1.2 / 2004**
  - Upload `.zip` → server unpacks, stores in S3 under `scorm/{lectureId}/`.
  - Add a SCORM runtime shim (`scorm-again` or `pipwerks SCORM API wrapper`) served via a sandboxed iframe at `/api/content/scorm/[lectureId]/index`.
  - Persist cmi data to `LectureProgress.contentPayloadJson`.
- **xAPI**
  - Minimal Learning Record Store (LRS) endpoint at `/api/xapi/statements` validated against xAPI 1.0.3. Write statements to `AuditLog`-like `XapiStatement` table.
- **Voice-Over Slides**
  - Author uploads PPT/PPTX/PDF. Convert server-side to per-slide PNG + text slot (use LibreOffice in a worker or a managed service like ConvertAPI).
  - Editor UI: slide thumbnail + editable voice-over text box per slide.
  - Runtime: a slide player component that advances manually; optionally reads text via SpeechSynthesis; counts as content completion when all slides visited.
- **Versioning & Drafts**
  - Add `CourseVersion` table storing snapshots of course + sections + lectures on publish. Editor always mutates the draft; publishing increments version.

**Deliverable**: All content types listed in Spec §7.1 render, progress, and count toward content-completion %.

### Phase 7 — Gen-AI Assisted Authoring (Week 15–17)

Spec §8.

- New service `src/lib/ai/assist.ts` using OpenAI (default model `gpt-6.1-sol`, API key or ChatGPT OAuth) with automatic DeepSeek V4.1 Flash fallback via `src/lib/ai/providers.ts`. Per-academy credentials stored encrypted (`CREDENTIAL_ENCRYPTION_KEY`).
- Capabilities exposed via `/api/ai/*` endpoints, each gated by `academy.aiEnabled`:
  - `POST /api/ai/outline` — given a topic, draft course scoping & outline.
  - `POST /api/ai/objectives` — draft learning objectives.
  - `POST /api/ai/voice-over` — draft voice-over text for a slide.
  - `POST /api/ai/quiz` — draft quiz questions (author-reviewed).
  - `POST /api/ai/metadata` — optimise title/description/tags.
  - `POST /api/ai/summarise` — summarise content.
- Editor UI: "AI Assist" button in each relevant editor section. All AI output lands in a draft field that requires explicit author approval (`AiInteraction.approved`).
- **Licence-free media**: integrate Unsplash API, Openverse, Wikimedia Commons. Store `licenseType`, `licenseUrl`, `sourceUrl` on uploaded `Resource`. Block non-approved licences.
- Per-tenant toggle in Academy settings; usage fully logged via `AiInteraction`; no data sent for training.

**Deliverable**: Author can produce a first-draft course outline, objectives, VO text, and quiz in minutes; every AI action is logged and author-approved.

### Phase 8 — Role Dashboards (Week 17–20)

Spec's Role-Based Experience Walkthrough.

- **Learner dashboard** (`/learner`) — completes Phase 3 scaffolding; adds Profile editor with `nameToBeCalled`, `certificateName`.
- **Course Developer** (`/developer`) — Draft/Published lists, version history, revenue-linked courses, AI Assist. Most exists under [/instructor](../src/app/(instructor)/) today; rename route group and extend.
- **Academy Admin** (`/academy`)
  - `/academy/branding`, `/academy/catalogue-governance` (approve courses/programmes), `/academy/pricing`, `/academy/marketers`, `/academy/learners` (view/deactivate only — cannot edit grades/certs), `/academy/finance/ledger`, `/academy/finance/payouts`, `/academy/settings` (AI, CPD, survey requirements, currency, tax, language).
- **Marketer** (`/marketer`) — performance (clicks / conversions / commission earned), payout history. No PII beyond attribution.
- **Platform Owner** (`/platform`) — global revenue, academy performance, platform growth, policy controls (platform support fee, marketer commission %, developer split default), promo code generation, compliance oversight.
- **Platform Support** (`/platform/ops`) — infrastructure dashboards (uptime, security events, backups), fixed-fee collection report. No business data access beyond counts.

**Deliverable**: Each of the six roles has a logically complete workspace matching the Spec walkthrough.

### Phase 9 — Internationalisation, Tax, Compliance (Week 20–22)

Spec §18.

- **i18n**: integrate `next-intl`. Extract strings; seed EN. Provide ZH, MS as first additional locales; add an admin translation workflow.
- UTF-8 already supported via Postgres; ensure PDF fonts (invoice / certificate) embed CJK where Academy language requires it (Noto Sans CJK).
- **Multi-currency**: add `currency` column to `Course`, `Programme`, `LedgerEntry`; present prices per Academy default, allow SGD explicitly. Stripe Checkout accepts `currency` per session.
- **Tax**: `TaxRate` model + a tax calculator in `src/lib/tax.ts`. Invoices show jurisdiction-specific VAT/GST and include Academy's tax registration number.
- **Compliance**
  - `/learner/privacy/export` — generate a data export (JSON + PDF bundle).
  - `/learner/privacy/deactivate` — soft delete (`User.isActive = false`), data retained.
  - Audit log retention 7 years; password storage already bcrypt; add rate-limiting middleware on auth routes.

**Deliverable**: A non-English learner in SGD can complete a purchase, receive a SGD invoice with GST, and receive certificates rendered in the correct locale.

### Phase 10 — Hardening & Launch (Week 22–24)

- Load-test checkout + progress APIs.
- Add monitoring (Sentry, Coolify container metrics, Grafana dashboards) with clear SLOs.
- Backup/restore runbook for Postgres and Cloudinary/S3.
- Security review: OWASP top 10, JWT expiry / rotation, webhook signature validation audit, file-upload scanning for SCORM.
- Finalise legal: terms, privacy, DPA templates per jurisdiction.
- Final UAT with a test Academy and a full learner journey.

---

## 6. Critical Files to Touch (Quick Reference)

- Schema: [prisma/schema.prisma](../prisma/schema.prisma)
- Auth: [src/lib/auth.ts](../src/lib/auth.ts), [src/middleware.ts](../src/middleware.ts)
- Register: [src/app/api/auth/register/route.ts](../src/app/api/auth/register/route.ts), [src/components/auth/register-form.tsx](../src/components/auth/register-form.tsx)
- Checkout: [src/app/api/checkout/route.ts](../src/app/api/checkout/route.ts), [src/lib/stripe.ts](../src/lib/stripe.ts)
- Stripe webhook: [src/app/api/webhooks/stripe/route.ts](../src/app/api/webhooks/stripe/route.ts)
- Catalogue: [src/app/(browse)/](../src/app/(browse)/), [src/components/courses/](../src/components/courses/), [src/lib/constants.ts](../src/lib/constants.ts)
- Course editor: [src/components/courses/editor-sections/](../src/components/courses/editor-sections/), [src/app/(instructor)/](../src/app/(instructor)/)
- Progress / lecture viewer: [src/app/api/lectures/[lectureId]/progress/route.ts](../src/app/api/lectures/) , [src/components/courses/](../src/components/courses/)
- Certificates: [src/app/api/certificates/](../src/app/api/certificates/)
- Validations: [src/lib/validations/](../src/lib/validations/)
- Config: [src/lib/prisma.ts](../src/lib/prisma.ts), [src/lib/cloudinary.ts](../src/lib/cloudinary.ts), [src/lib/stripe.ts](../src/lib/stripe.ts)
- Root layout / Providers: [src/app/layout.tsx](../src/app/layout.tsx), [src/providers/](../src/providers/)

---

## 7. Reusable Utilities Already in the Codebase

Before adding new code, prefer these:

- `cn()` in [src/lib/utils.ts](../src/lib/utils.ts) for Tailwind class merging.
- `prisma` singleton in [src/lib/prisma.ts](../src/lib/prisma.ts).
- `auth()` helper in [src/lib/auth.ts](../src/lib/auth.ts) — **do not** reach for `getServerSession` / v4 patterns.
- Stripe helpers in [src/lib/stripe.ts](../src/lib/stripe.ts) (`calculateFees`, checkout session builders) — extend rather than replace.
- Cloudinary helpers in [src/lib/cloudinary.ts](../src/lib/cloudinary.ts) for uploads, thumbnails, deletions (used for SCORM unpack targets).
- Cart helpers in [src/lib/cart.ts](../src/lib/cart.ts) — extend to support Programme line items.
- Zod schemas in [src/lib/validations/](../src/lib/validations/) — extend rather than duplicate.
- `ITEMS_PER_PAGE` in [src/lib/constants.ts](../src/lib/constants.ts) — use for every paginated list.
- shadcn/ui components in [src/components/ui/](../src/components/ui/) — do not install a competing UI lib.
- dnd-kit patterns from [CourseContentEditor](../src/components/courses/) — reuse for Programme builder.
- React Query patterns in [src/providers/](../src/providers/) — follow existing `staleTime: 60s` baseline.

---

## 8. Testing & Verification

- **Unit**: add Vitest. Cover pure modules (`src/lib/certification.ts`, `src/lib/tax.ts`, `src/lib/ledger.ts`, `src/lib/access.ts`).
- **Integration**: use Prisma against a disposable Postgres (Docker) — exercise checkout ledger, access grants, certification engine.
- **E2E**: Playwright. Author a journey per role (public visitor, learner buying programme, developer publishing with AI assist, academy admin approving, marketer attribution, platform owner fee change, platform support audit).
- **Manual**: every phase ends with a smoke script documented in `docs/qa/phase-N.md`:
  - run `npm run dev`
  - execute the phase's golden path in a browser
  - verify audit log entries
  - verify ledger balances to zero for every `parentTxnId`
- **Data invariants**: a nightly job asserts:
  - Sum of `LedgerEntry.amountMinor` per `parentTxnId` equals zero (debits = credits).
  - No learner has an active `AccessGrant` past `expiresAt`.
  - Every issued `Certificate` has an originating `AssessmentAttempt.passed = true` and a `SurveyResponse`.

---

## 9. Key Risks & Mitigations

| Risk | Mitigation |
|---|---|
| SCORM/xAPI scope creep | Start with SCORM 1.2 + cmi core only; xAPI ingest-only LRS; defer reporting. |
| Gen-AI output quality | Always author-approved, never auto-publish; leverage prompt caching for cost control. |
| Financial correctness | Ledger is append-only, double-entry invariant tested in CI; refunds as reversals. |
| Multi-tenancy leakage | Every query wrapped by `withAcademy(ctx)` helper; automated test inserts data in Academy A then asserts Academy B sees none. |
| 90-day cutoff disputes | Issue reminder emails on schedule; surface expiry date on every enrolled course card; block access server-side (not just UI). |
| GDPR / PDPA | Soft-delete only; export endpoint; audit logs; clear privacy notice; DPAs per jurisdiction. |
| Locked rules tampering | Server-side constant for learning model + certification math; Platform Owner UI cannot mutate those fields. |

---

## 10. Open Questions for Stakeholders

1. **Tenant onboarding** — self-serve or sales-led? Drives whether `/platform/academies/new` is public or internal-only.
2. **Payment processor** — Stripe only, or add regional processors (e.g. PayNow for SGD)?
3. **Email provider** — Resend, Postmark, SES? Affects deliverability and template tooling.
4. **AI cost controls** — per-academy monthly cap, or flat per-user rate-limit?
5. **SCORM storage** — keep on Cloudinary raw or dedicate S3/R2? Affects cost model and egress.
6. **Certificate verification UX** — public page only, or also a downloadable JSON proof?
7. **Data residency** — EU / SG / US segregation required, or single region acceptable?

---

## 11. Milestone Summary

| Phase | Weeks | Ship Gate |
|---|---|---|
| 0 — Foundation | 0–1 | Dev env + CI + audit plumbing |
| 1 — Tenancy & Roles | 1–3 | 6 roles can log in and see role-appropriate shell |
| 2 — Public Catalogue | 3–5 | Banners, filters, sorts, Programme cards |
| 3 — Content Model | 5–7 | Programmes, Complimentary, 90-day access enforced |
| 4 — Payments & Ledger | 7–10 | End-to-end paid purchase with correct split |
| 5 — Certification & Survey | 10–12 | Auto-issued certs with QR verify |
| 6 — Advanced Authoring | 12–15 | SCORM / xAPI / voice-over slides |
| 7 — Gen-AI | 15–17 | AI Assist across authoring |
| 8 — Role Dashboards | 17–20 | Every role dashboard feature-complete |
| 9 — i18n / Tax / Compliance | 20–22 | Multi-currency, multi-locale, GDPR/PDPA |
| 10 — Hardening | 22–24 | Production-ready |

Total: **~24 weeks** for a single team of ~4–6 engineers plus designer + PM. Parallelisation between phases 3/4 and 6/7 possible with two squads.
