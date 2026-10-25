<div align="center">

# IESA LMS (Learnify)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma)](https://prisma.io/)
[![Stripe](https://img.shields.io/badge/Stripe-Payments-635BFF?logo=stripe&logoColor=white)](https://stripe.com/)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--6.1--sol-412991?logo=openai&logoColor=white)](https://openai.com/)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4.1_Flash_fallback-4D6BFE)](https://www.deepseek.com/)
[![Docker](https://img.shields.io/badge/Docker-Coolify-2496ED?logo=docker&logoColor=white)](https://coolify.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red)](#license)

**An international, scalable, self-learning LMS built for academies, course developers, and learners.**

[Live Site](https://learnify.tertiaryinfotech.com) · [Report Bug](https://github.com/alfredang/ai-learnify/issues) · [Request Feature](https://github.com/alfredang/ai-learnify/issues)

</div>

## Screenshot

Live at [learnify.tertiaryinfotech.com](https://learnify.tertiaryinfotech.com).

![Screenshot](screenshot.png)

## About

IESA LMS is a multi-tenant, self-paced Learning Management System built on Next.js 16. Forked from Learnify (Udemy-clone) and reshaped end-to-end against the IESA LMS product specification, it delivers a production-grade platform for academies to publish, sell, and certify online courses.

### Key Features

- **6 User Roles** — Platform Owner, Platform Support, Academy Admin, Course Developer, Marketer, Learner
- **3 Content Models** — Complimentary Programmes (free, no expiry), E-Courses (paid/free), Programmes (course bundles with shared 90-day access window)
- **8 Lecture Types** — Video, Text, Quiz, PDF, SCORM 1.2/2004, xAPI, Voice-Over Slides, Downloadable
- **5 Quiz Question Types** — Multiple choice, multiple select, true/false, drag-and-drop ordering, open-ended
- **4-Way Revenue Distribution** — Marketer commission → Platform support fee → Discount → Academy/Developer split (default 50/50)
- **Catalogue Governance** — Academy Admins approve or reject Course Developer submissions with author-visible rejection reasons; full audit trail on every state transition
- **Immutable Double-Entry Ledger** — Every money movement writes append-only ledger entries; refunds are reversal entries; nightly invariant cron asserts every transaction sums to zero
- **Auto-Issued Certificates** — Gated by >=50% content + >=80% assessment + survey + before expiry; PDF with QR verification
- **Gen-AI Authoring** — Per-tenant toggle, author-approval-gated drafts via OpenAI `gpt-6.1-sol` with automatic DeepSeek V4.1 Flash fallback (outlines, objectives, quizzes, voice-over text, metadata)
- **SCORM Studio** — Upload a lecture video, add a brief, and an agent harness designs, renders, validates (SCORM 1.2 conformance) and publishes a ready-to-attach SCORM package
- **GDPR/PDPA Compliance** — JSON data export, soft-deactivation, audit trail with 7-year retention

## Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router, Server Components, Server Actions, Turbopack) |
| **Language** | TypeScript (strict mode) |
| **Database** | PostgreSQL 17 (Coolify-managed container) via Prisma 5 ORM |
| **Auth** | NextAuth.js v5 (JWT, email+password for learners, OAuth for staff) |
| **Payments** | Stripe (Checkout Sessions, Connect, Webhooks) |
| **Media** | Cloudinary (signed uploads, video transcoding, CDN) or local disk under `STORAGE_DIR`, served by `/uploads/[...path]` |
| **AI** | OpenAI `gpt-6.1-sol` (primary) with DeepSeek V4.1 Flash automatic fallback — plain `fetch` adapters in `src/lib/ai/providers.ts`, no vendor SDK |
| **Email** | Resend (invoices, access reminders) |
| **UI** | Tailwind CSS 4 + shadcn/ui (Radix primitives) |
| **Forms** | React Hook Form + Zod validation |
| **Data Fetching** | TanStack React Query |
| **State** | Zustand |
| **Rich Text** | TipTap |
| **Drag & Drop** | dnd-kit |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Deploy** | Docker (Next.js standalone, Node 22) on a Hostinger VPS managed by Coolify; Traefik + Let's Encrypt TLS |

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Frontend                                │
│   Next.js 16 App Router  ·  React 19  ·  Tailwind + shadcn/ui   │
│   Server Components (default)  ·  Client Components (opt-in)    │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                          Backend                                 │
│   API Routes (REST)  ·  Server Actions  ·  NextAuth v5 (JWT)    │
│   Stripe Webhooks  ·  Cron Jobs  ·  xAPI LRS  ·  AI Assist      │
└──────────────────────────┬───────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────┐
│                        Data Layer                                │
│   PostgreSQL (Prisma ORM)  ·  Cloudinary (Media)  ·  Stripe     │
│   Immutable Ledger  ·  Audit Log  ·  Feature Flags               │
└──────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
src/
├── app/                        # Next.js App Router
│   ├── (auth)/                 # Login, register, password reset
│   ├── (browse)/               # Public catalogue, course detail, search
│   ├── (learner)/              # Learner dashboard & pages
│   ├── (instructor)/           # Course Developer editor, dashboard, SCORM Studio
│   ├── (academy)/              # Academy Admin tenant area
│   ├── (marketer)/             # Marketer dashboard
│   ├── (platform)/             # Platform Owner / Support dashboards
│   ├── api/                    # 50+ REST endpoints, cron, webhooks, AI, xAPI, SCORM jobs
│   ├── actions/                # Server Actions
│   ├── checkout/               # Stripe checkout pages
│   ├── uploads/[...path]/      # Serves STORAGE_DIR files (HTTP Range support)
│   └── verify/                 # Public certificate verification
├── components/                 # UI components
│   ├── auth/                   # Login/register forms
│   ├── courses/                # Editors, players, quiz builders
│   ├── layout/                 # Header, footer, sidebars
│   ├── shared/                 # AI assist, audit logs, reusable
│   └── ui/                     # 22 shadcn/ui components
├── lib/                        # Domain logic (33 modules)
│   ├── ai/                     # AI Assist orchestration (OpenAI → DeepSeek)
│   │   ├── providers.ts        # Plain fetch adapters: OpenAI Responses API, DeepSeek
│   │   └── harness/            # Traced agent runner + SCORM video agent
│   ├── scorm/                  # SCORM 1.2 manifest, SCO template, validator, ZIP
│   ├── storage.ts              # Local file storage (STORAGE_DIR) when Cloudinary is absent
│   ├── validations/            # Zod schemas
│   ├── ledger.ts               # Double-entry ledger (spec §16)
│   ├── certification.ts        # Cert eligibility engine (spec §12-13)
│   ├── access.ts               # 90-day access enforcement
│   ├── tax.ts                  # Jurisdiction-aware tax calc
│   └── audit.ts                # Append-only audit logging
├── i18n/messages/              # EN, ZH, MS translations
├── providers/                  # Auth, React Query providers
└── types/                      # TypeScript type definitions
prisma/
├── schema.prisma               # 30+ models, 13 enums (1,289 lines)
├── seed.ts                     # Dev seed data
└── migrations/                 # Database migrations
docs/                           # 20 markdown docs (MkDocs)
scripts/                        # 20 migration/verification utilities
Dockerfile                      # Node 22 standalone image (Coolify Dockerfile build pack)
docker-entrypoint.sh            # Runs `prisma migrate deploy`, then starts server.js
```

## Getting Started

### Prerequisites

- **Node.js** 20+ (the production image uses Node 22)
- **PostgreSQL** 15+ locally (production runs PostgreSQL 17 as a Coolify-managed container)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/alfredang/ai-learnify.git
cd ai-learnify

# 2. Install dependencies (postinstall runs prisma generate)
npm install

# 3. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_APP_URL (others optional)

# 4. Push schema to database
npm run db:push

# 5. (Optional) Seed test data
npm run db:seed
npx tsx scripts/seed-filter-coverage.ts

# 6. Start dev server
npm run dev
```

### Test Accounts (after `npm run db:seed`)

| Email | Role | Password |
|-------|------|----------|
| `admin@learnify.com` | Platform Owner + Academy Admin | `password123` |
| `john@learnify.com` | Course Developer | `password123` |
| `sarah@learnify.com` | Course Developer | `password123` |
| `student1@example.com` | Learner | `password123` |

> **Warning:** Do not run `npm run db:seed` against a production database.

### Optional Integrations

Every integration degrades gracefully when env vars are absent:

| Integration | Env Vars | Purpose |
|-------------|----------|---------|
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Paid checkout |
| Cloudinary | `CLOUDINARY_*`, `NEXT_PUBLIC_CLOUDINARY_*` | File/video uploads |
| OpenAI | `OPENAI_API_KEY` — or ChatGPT OAuth via `OPENAI_OAUTH_ACCESS_TOKEN` (+ optional `OPENAI_OAUTH_REFRESH_TOKEN`, `OPENAI_ACCOUNT_ID`); `OPENAI_MODEL` overrides `gpt-6.1-sol` | AI Assist + SCORM Studio (primary provider) |
| DeepSeek | `DEEPSEEK_API_KEY` (+ optional `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, default `deepseek-flash`) | Automatic fallback when OpenAI fails or is unset |
| Credential vault | `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM encryption of per-academy AI credentials |
| Local storage | `STORAGE_DIR` (default `./storage`; `/app/storage` volume in Docker) | Uploads + SCORM packages when Cloudinary is not configured |
| Resend | `RESEND_API_KEY`, `EMAIL_FROM` | Invoice + reminder emails |
| OAuth | `AUTH_GOOGLE_*`, `AUTH_GITHUB_*` | Staff OAuth (learners are email-only) |
| Cron | `CRON_SECRET` | Protects `/api/cron/*` endpoints |

## SCORM Studio

Course Developers can turn a single lecture video into a conformant SCORM 1.2 package at `/instructor/scorm-studio`:

1. Upload the video (MP4/H.264 recommended, up to 500 MB) and add a brief or transcript.
2. An agent harness (`src/lib/ai/harness/runner.ts` + `scorm-video-agent.ts`) runs traced steps: probe video → AI learning design (OpenAI → DeepSeek, self-repair, template fallback) → review → render SCO (`index.html` + `scripts/scorm_api.js`) → write `imsmanifest.xml` → SCORM 1.2 conformance validation → publish.
3. The unpacked package and ZIP land under `/uploads/scorm/<jobId>/`; optionally attach the result as a SCORM lecture in one click.

Jobs persist in the `ScormBuildJob` model. API: `POST /api/scorm/jobs` (multipart), `GET /api/scorm/jobs`, `GET /api/scorm/jobs/[id]`, `POST /api/scorm/jobs/[id]/attach`. Modelled on [workplacesafety-scorm](https://github.com/alfredang/workplacesafety-scorm).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with Turbopack HMR |
| `npm run build` | Production build (`prisma generate && next build`) |
| `npm run start` | Production server |
| `npm run lint` | ESLint |
| `npm run db:push` | Apply schema to DB (dev only) |
| `npm run db:migrate` | Run Prisma migrations (production) |
| `npm run db:seed` | Seed test data |
| `npm run db:studio` | Open Prisma Studio GUI |

## Health & Ops

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | Liveness + DB ping + integration status |
| `GET /api/cron/ledger-invariant` | Nightly check — fails if any transaction doesn't sum to zero |
| `GET /api/cron/access-reminders` | Sends M1/M2/T-14d reminders when email is configured |

See `docs/runbook.md` for backup/restore procedures and incident playbooks.

## Deployment

### Coolify on a Hostinger VPS (Production)

Production runs at [learnify.tertiaryinfotech.com](https://learnify.tertiaryinfotech.com) as a Docker container managed by [Coolify](https://coolify.tertiarytraining.com):

- Built from the repo's `Dockerfile` (Next.js standalone, Node 22); `docker-entrypoint.sh` runs `prisma migrate deploy` on every boot
- PostgreSQL 17 runs as a Coolify-managed container on the same server
- Persistent volume mounted at `/app/storage` (`STORAGE_DIR`) for uploads and SCORM packages
- TLS via Traefik + Let's Encrypt (TLS-ALPN challenge)
- CI/CD: a GitHub webhook on push to `main` triggers a Coolify rebuild; GitHub Actions (`.github/workflows/ci.yml`) only lints, typechecks and test-builds the image

Full guide: `docs/deployment/coolify.md`.

### Other Platforms

See the deployment guides in `docs/deployment/`:
- `docs/deployment/coolify.md`
- `docs/deployment/docker.md`
- `docs/deployment/railway.md`

## Contributing

This is a closed-source project. External pull requests are not accepted at this time. Internal contributors should branch from `main`, follow the conventions in `docs/contributing.md`, and complete `docs/uat-checklist.md` before merge.

## Developed By

**Tertiary Infotech Academy Pte. Ltd.**

## Acknowledgements

- [Next.js](https://nextjs.org/) — React framework
- [Prisma](https://prisma.io/) — Database ORM
- [shadcn/ui](https://ui.shadcn.com/) — UI component library
- [Stripe](https://stripe.com/) — Payment processing
- [Cloudinary](https://cloudinary.com/) — Media management
- [OpenAI](https://openai.com/) — AI-assisted authoring (primary)
- [DeepSeek](https://www.deepseek.com/) — AI-assisted authoring (fallback)
- [Coolify](https://coolify.io/) — Self-hosted deployment
- [Resend](https://resend.com/) — Transactional email

---

<div align="center">

If you have access to this repository, please give it a star!

</div>

## License

Proprietary / All Rights Reserved. This repo is **not** open-source — clone and modification rights are retained by the project owner.
