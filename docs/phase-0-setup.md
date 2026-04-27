# Phase 0 — Foundation Setup

Concrete steps to bring a developer (or this machine) from zero to a running Learnify dev server with the Phase 0 scaffolding in place.

Phase 0 deliverables added in this pass:

- `.env.example` — complete environment template.
- `.github/workflows/ci.yml` — typecheck + lint + `prisma validate` on PR/main.
- `FeatureFlag` Prisma model + `src/lib/feature-flags.ts` (`isEnabled`, `setFlag`).
- `AuditLog` Prisma model + `src/lib/audit.ts` (`audit`, `getRequestIp`).

What still needs to happen on your machine to complete Phase 0.

---

## 1. Install Node.js 20 LTS

Node.js is **not** currently installed on this Windows machine. Pick one:

```powershell
# Option A — winget (recommended)
winget install OpenJS.NodeJS.LTS

# Option B — Chocolatey
choco install nodejs-lts -y
```

Then **open a new terminal** so PATH picks up `node` and `npm`. Verify:

```powershell
node --version   # expect v20.x
npm --version
```

## 2. Provision Postgres

Pick one:

- **Neon (recommended)** — sign up at https://neon.tech, create a project, copy the connection string (append `?sslmode=require`).
- **Local Postgres** — install Postgres 15+, create DB `learnify`, use `postgresql://postgres:password@localhost:5432/learnify`.

## 3. Create `.env`

```powershell
Copy-Item .env.example .env
```

Fill in at minimum:

- `DATABASE_URL`
- `AUTH_SECRET` (`openssl rand -base64 32`)
- `AUTH_URL="http://localhost:3000"`
- `NEXT_PUBLIC_APP_URL="http://localhost:3000"`

Everything else can stay blank for Phase 0 — Stripe / Cloudinary / Anthropic / Resend are not exercised until later phases.

## 4. Install dependencies and push schema

```powershell
npm install           # postinstall runs prisma generate
npm run db:push       # creates all tables incl. FeatureFlag + AuditLog
npm run db:seed       # optional — seed sample data
```

## 5. Run the dev server

```powershell
npm run dev
# http://localhost:3000
```

## 6. Smoke-test the Phase 0 scaffolding

Open a Node REPL (`npx tsx`) or add a temporary route. Expected behaviour:

```ts
import { isEnabled, setFlag } from "@/lib/feature-flags"
import { audit } from "@/lib/audit"

await setFlag("phase-0-smoke", true)
await isEnabled("phase-0-smoke")            // true
await isEnabled("phase-0-smoke", { academyId: "acme" })  // true (falls back to global)
await setFlag("phase-0-smoke", false, { academyId: "acme" })
await isEnabled("phase-0-smoke", { academyId: "acme" })  // false (tenant override)

await audit({
  action: "phase-0.smoke",
  resourceType: "system",
  metadata: { note: "hello" },
})
// row appears in AuditLog table
```

## 7. Confirm CI is green

Open a draft PR against `main` and confirm `.github/workflows/ci.yml` runs `prisma validate`, `tsc --noEmit`, and `npm run lint` successfully.

---

## Phase 0 Exit Criteria

- [ ] `npm run dev` serves http://localhost:3000 without errors.
- [ ] `FeatureFlag` and `AuditLog` tables exist in Postgres.
- [ ] `isEnabled` / `setFlag` round-trip works (global + tenant override).
- [ ] `audit()` writes a row without throwing.
- [ ] CI workflow passes on a PR.

Once all five are ticked, Phase 1 (multi-tenancy + 6-role expansion) can begin.
