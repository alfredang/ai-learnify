# CLAUDE.md — IESA LMS (Learnify)

## Project Overview

IESA LMS is an **international, scalable, self-learning LMS** built as a multi-tenant SaaS platform. It is a heavily customised fork of Learnify (Udemy-clone), reshaped end-to-end against the IESA LMS full product specification.

### Product Objectives (from Spec)

1. Enable **public discovery** of learning content
2. Support **paid courses, programmes** (bundled courses), and **free/complimentary content**
3. Automate **certification** with strict, configurable rules
4. Enforce **transparent revenue sharing** (4-way split: Academy, Developer, Marketer, Platform Support)
5. **Retain learner records permanently** (soft-delete only, no data destruction)
6. Support **Gen-AI-assisted content authoring** (Anthropic Claude)

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
| Database | PostgreSQL (Neon recommended) | 15+ |
| ORM | Prisma | 5.22.0 |
| Auth | NextAuth.js v5 (JWT strategy) | 5.0.0-beta.30 |
| UI | Tailwind CSS 4 + shadcn/ui (Radix) | - |
| Forms | React Hook Form + Zod | 7.x / 4.x |
| Data Fetching | TanStack React Query | 5.x |
| Client State | Zustand | 5.x |
| Payments | Stripe (Checkout + Connect + Webhooks) | 2026-01-28 API |
| Media | Cloudinary (signed uploads) | 2.9.0 |
| Rich Text | TipTap | 3.x |
| Drag-and-Drop | dnd-kit | 6.3/10.0 |
| Charts | Recharts | 3.x |
| AI | Anthropic SDK (Claude) | 0.88.0 |
| Email | Resend | - |
| Icons | Lucide React | 0.563.0 |
| Toasts | Sonner | 2.x |
| Deploy | Netlify (plugin-nextjs) | - |

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
    (instructor)/        # Course Developer editor & dashboard
    (academy)/           # Academy Admin tenant dashboard
    (marketer)/          # Marketer dashboard
    (platform)/          # Platform Owner + Support dashboards
    (student)/           # Legacy learner pages
    (admin)/             # Legacy admin routes
    api/                 # 50+ REST route.ts files
    actions/             # Server Actions
    checkout/            # Stripe checkout pages
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
    ai/                  # Anthropic Claude integration
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
| AI Assist | `src/lib/ai/assist.ts` | Anthropic Claude integration |
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
- `NEXT_PUBLIC_APP_URL` — Full app URL

**Optional (graceful degradation):**
- `STRIPE_*` — Payment processing
- `CLOUDINARY_*` — Media uploads
- `AUTH_GOOGLE_*`, `AUTH_GITHUB_*` — Staff OAuth
- `ANTHROPIC_API_KEY` — AI assist (Phase 7)
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

The project follows a 10-phase roadmap (see `docs/lms-implementation-plan.md`):

| Phase | Status | Description |
|-------|--------|-------------|
| 0 — Foundation | Done | Dev env, CI, audit plumbing, feature flags |
| 1 — Multi-Tenancy & Roles | Done | 6 roles, Academy model, membership scoping |
| 2 — Public Catalogue | Done | Banners, filters, sorts, Programme cards |
| 3 — Content Model | Done | Programmes, Complimentary, 90-day access |
| 4 — Payments & Ledger | Done | Ledger, promo codes, invoices, refunds, payouts |
| 5 — Certification & Survey | Done | Auto-issued certs, QR verify, quiz attempts |
| 6 — Advanced Authoring | Done | SCORM, xAPI, voice-over slides, versioning |
| 7 — Gen-AI | Done | AI Assist (Claude), audit logging |
| 8 — Role Dashboards | Done | All 6 role dashboards functional |
| 9 — i18n / Tax / Compliance | Partial | Tax + multi-currency done; i18n scaffold only |
| 10 — Hardening | Partial | Security headers + rate limiting done; load testing pending |

---

## Critical Rules

1. **Ledger is append-only** — never UPDATE or DELETE a LedgerEntry. Corrections are reversal entries.
2. **Learning model is locked** — self-paced, async, no live classes, no manual grading. Do not add features that violate this.
3. **Learners cannot use OAuth** — spec section 3.1 requires email+password only for learners.
4. **90-day access is server-enforced** — never rely on UI-only enforcement.
5. **All AI output requires author approval** — never auto-publish AI-generated content.
6. **Audit every write operation** — call `audit()` from `src/lib/audit.ts` on all mutations.
7. **Soft-delete only** — never hard-delete user data. Use `isActive = false` + `deactivatedAt`.
