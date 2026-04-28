# TODO.md — IESA LMS Implementation Checklist

Tracks every spec requirement against actual implementation status.
Last audited: 2026-04-28

---

## Phase 0 — Foundation & Environment

- [x] Dev environment runs (Node 20+, Postgres, .env)
- [x] CI workflow (.github/workflows/ci.yml — typecheck + lint + prisma validate)
- [x] Feature flags table + `isEnabled(flag, ctx)` helper (`src/lib/feature-flags.ts`)
- [x] Audit logging helper `audit()` in `src/lib/audit.ts` (append-only AuditLog)

---

## Phase 1 — Multi-Tenancy & Role Expansion

- [x] `Academy` model in schema (name, slug, branding, currency, tax jurisdiction, aiEnabled)
- [x] `AcademyMembership` join table (userId + academyId + AcademyRole)
- [x] `PlatformRole` enum on User (NONE, PLATFORM_OWNER, PLATFORM_SUPPORT)
- [x] `AcademyRole` enum (LEARNER, COURSE_DEVELOPER, ACADEMY_ADMIN, MARKETER)
- [x] User profile fields: `username`, `certificateName`, `nameToBeCalled`, `certificateIdNumber`
- [x] Data migration script: Default Academy, role mapping (`scripts/migrate-phase-1.ts`)
- [x] Auth callbacks resolve `academyMemberships` + `platformRole` into JWT
- [x] Middleware gates routes by platformRole / academyRole / auth
- [x] OAuth blocked for Learner sign-ins (spec section 3.1)
- [x] OAuth available for staff roles (Google + GitHub)
- [x] Registration form with certificate fields
- [x] Route groups: `(learner)`, `(academy)`, `(marketer)`, `(platform)` with pages
- [x] Legacy role string checks replaced with new role helpers

---

## Phase 2 — Public Interface & Catalogue Overhaul

- [x] `Banner` model (academyId, imageUrl, targetUrl, position, rotation, dates)
- [x] Banner admin UI at `/academy/branding`
- [x] `Sector` model (academy-scoped catalogue filter)
- [x] `CpdCatalog` model (CPD name, points, badge per academy)
- [x] Catalogue filters: Sector, CPD, Course/Programme, Price, Partner
- [x] Catalogue sorting: Newest, Alphabetical, Partner, CPD points
- [x] CourseCard with Partner logo and CPD badge
- [x] "Complimentary" label for free content
- [x] Public course detail page: Learning Objectives, Module Outline, CPD info, Partner info
- [x] Programme card variant and detail page

---

## Phase 3 — Content Model: Programmes, Complimentary, Access Windows

- [x] `Programme` model (academyId, title, price, currency, status, accessDurationDays)
- [x] `ProgrammeCourse` join table (programmeId + courseId + position)
- [x] `AccessGrant` model (userId, productType, courseId/programmeId, grantedAt/expiresAt, isActive)
- [x] Complimentary Programme: `productType = COMPLIMENTARY`, auto-granted on registration
- [x] 90-day access enforcement server-side (`src/lib/access.ts`)
- [x] "Locked content after expiry" UI state
- [x] Learner dashboard tabs: Complimentary, My Courses, My Programmes, Certificates, Invoices, Profile
- [x] `Survey` model + `SurveyResponse` model
- [x] Reminder job scaffolding (cron endpoint for M1/M2/T-14d)

---

## Phase 4 — Payment, Ledger, Revenue Split, Promo Codes

- [x] `LedgerEntry` model (append-only, parentTxnId, multi-leg, no updatedAt)
- [x] Checkout accepts COURSE / PROGRAMME / promoCode
- [x] Stripe webhook: atomically creates Purchase + AccessGrant + LedgerEntry legs
- [x] 5-7 ledger legs per purchase: CHARGE, DISCOUNT, MARKETER, PLATFORM_SUPPORT, TAX, ACADEMY, DEVELOPER
- [x] `computeLegs()` in `src/lib/ledger.ts` (spec section 15-16)
- [x] `Invoice` model + HTML-to-PDF generation (`src/lib/invoice-html.ts`)
- [x] Jurisdiction-aware invoice with VAT/GST summary
- [x] Email invoices via Resend
- [x] `PromoCode` model (marketer commission %, learner discount %, usage limits)
- [x] Promo code CRUD under Academy Admin (`/api/academy/promo-codes`)
- [x] Refund flow: reversal LedgerEntry rows + Stripe refund (`/api/academy/refunds`)
- [x] Reminder cron: `/api/cron/access-reminders` (M1_END, M2_END, T_MINUS_14)
- [x] `PayoutBatch` model (academy, payoutGroup, period, status, total)
- [x] Payout UI at `/academy/finance/payouts`
- [x] `TaxRate` model + tax calculator (`src/lib/tax.ts`)
- [x] Nightly ledger invariant check (`/api/cron/ledger-invariant`)

---

## Phase 5 — Certification & Survey

- [x] `CertificateRule` model (per-academy: minContentPct, minAssessmentPct, requiresSurvey, mustBeBeforeExpiry)
- [x] `CertificateTemplate` model (logos, signatory, layoutJson)
- [x] Certification engine (`src/lib/certification.ts` — checkCertEligibility)
- [x] Default thresholds: >=50% content + >=80% assessment + survey + before expiry
- [x] `AssessmentAttempt` model (lectureId, userId, scorePct, passed, answers, attemptNumber)
- [x] QuizBuilder component (multiple choice, true/false, short answer)
- [x] QuizPlayer component (grading, attempt tracking, retake limits)
- [x] SurveyForm component (star rating + custom questions, triggers cert check)
- [x] Certificate PDF with QR code
- [x] Public verification route `/verify/[certificateId]`
- [x] Academy Admin: aggregated survey star ratings per course

---

## Phase 6 — Advanced Authoring: SCORM, xAPI, Voice-Over Slides

- [x] `LectureType` enum: VIDEO, TEXT, QUIZ, PDF, SCORM, XAPI, VOICE_OVER_SLIDES, DOWNLOADABLE
- [x] SCORM support (ScormPlayer component, contentPayloadJson for packageUrl)
- [x] xAPI write-only LRS (`/api/xapi/statements`, XapiStatement model)
- [x] Voice-over slides (SlidePlayer component, PDF-to-slides workflow)
- [x] `CourseVersion` model (frozen snapshots on publish, version numbering)
- [x] Polymorphic `contentPayloadJson` on Lecture for per-type data

---

## Phase 7 — Gen-AI Assisted Authoring

- [x] AI assist service (`src/lib/ai/assist.ts`, Anthropic Claude SDK)
- [x] Prompt caching (5-min TTL, prefix match)
- [x] AI capabilities: OUTLINE, OBJECTIVES, VOICE_OVER, QUIZ, METADATA, SUMMARISE
- [x] AI endpoints: `/api/ai/assist`, `/api/ai/approve`, `/api/ai/media`
- [x] `AiInteraction` model (audit trail: promptHash, outputHash, approved flag)
- [x] AI Assist button in editor UI (`src/components/shared/ai-assist-button.tsx`)
- [x] Per-tenant toggle (`academy.aiEnabled`)
- [x] All AI output requires explicit author approval before publish
- [ ] Licence-free media integration (Unsplash API, Openverse, Wikimedia Commons — Resource model has licence fields but external API integration not confirmed)

---

## Phase 8 — Role Dashboards

- [x] Learner dashboard (`/learner`) — active grants, certs, invoices, complimentary
- [x] Learner sub-pages: `/learner/my-courses`, `/learner/programmes`, `/learner/certificates`
- [x] Course Developer dashboard (`/instructor`) — course list, earnings, performance
- [x] Academy Admin dashboard (`/academy`) — stats, pending courses, learners, ratings
- [x] Academy Admin sub-pages: branding, catalogue, pricing, marketers, learners, finance
- [x] Marketer dashboard (`/marketer`) — promo code conversions, usage tracking
- [x] Platform Owner dashboard (`/platform`) — global stats, academy performance, audit log
- [x] Platform Support dashboard (`/platform/ops`) — audit pages
- [ ] Platform Support: infrastructure dashboards (uptime monitors, security events, backup status) — currently shows audit log only, not full ops tooling
- [ ] Platform Owner: policy controls UI (platform support fee %, marketer commission %, developer split default) — `PlatformSettings` model exists but admin UI for editing not confirmed

---

## Phase 9 — Internationalisation, Tax, Compliance

- [x] Multi-currency support (Course.currency, Academy.primaryCurrency, LedgerEntry.currency)
- [x] SGD explicitly supported
- [x] `TaxRate` model + jurisdiction-aware tax calculation
- [x] Invoices show jurisdiction-specific VAT/GST
- [x] GDPR data export endpoint (`/api/profile/export`)
- [x] Account deactivation (soft delete: `User.isActive`, `deactivatedAt`)
- [x] Audit log retention (append-only AuditLog model)
- [x] Password hashing (bcrypt)
- [x] Rate-limiting on auth routes (`src/lib/rate-limit.ts`)
- [x] i18n message bundles (EN, ZH, MS) in `src/i18n/messages/`
- [ ] Full `next-intl` routing integration (locale-prefixed routes, language switcher UI)
- [ ] CJK font embedding in certificate/invoice PDFs (Noto Sans CJK)
- [ ] Admin translation workflow UI
- [ ] Academy tax registration number on invoices

---

## Phase 10 — Hardening & Launch

- [x] Security headers (X-Content-Type-Options, X-Frame-Options, HSTS, Permissions-Policy, Referrer-Policy)
- [x] Health endpoint (`/api/health` — DB probe, integration status, response time)
- [x] Rate limiting middleware
- [x] Stripe webhook signature validation
- [ ] Load testing (checkout + progress APIs)
- [ ] Monitoring setup (Sentry / Vercel Analytics / Grafana dashboards with SLOs)
- [ ] Backup/restore runbook for Postgres and Cloudinary/S3 (docs/runbook.md exists but operational tooling not verified)
- [ ] OWASP security audit (formal pass — docs/security-review.md exists as reference)
- [ ] File-upload scanning for SCORM packages
- [ ] Legal documents: terms of service, privacy policy, DPA templates per jurisdiction
- [ ] Final UAT with test Academy and full learner journey (docs/uat-checklist.md exists as script)
- [ ] Vitest unit tests for pure modules (certification, tax, ledger, access)
- [ ] Playwright E2E tests (per-role journeys)

---

## Summary

| Phase | Total Items | Done | Remaining |
|-------|------------|------|-----------|
| 0 — Foundation | 4 | 4 | 0 |
| 1 — Multi-Tenancy & Roles | 13 | 13 | 0 |
| 2 — Public Catalogue | 10 | 10 | 0 |
| 3 — Content Model | 9 | 9 | 0 |
| 4 — Payments & Ledger | 16 | 16 | 0 |
| 5 — Certification & Survey | 11 | 11 | 0 |
| 6 — Advanced Authoring | 6 | 6 | 0 |
| 7 — Gen-AI | 8 | 7 | 1 |
| 8 — Role Dashboards | 10 | 8 | 2 |
| 9 — i18n / Tax / Compliance | 14 | 10 | 4 |
| 10 — Hardening | 12 | 4 | 8 |
| **TOTAL** | **113** | **98** | **15** |

**Overall: ~87% complete.** Phases 0-6 are fully implemented. Remaining work is concentrated in i18n routing, Platform dashboard polish, testing infrastructure, and launch hardening.
