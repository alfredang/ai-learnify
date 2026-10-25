# Deploy with Coolify (Hostinger VPS)

Production for Learnify runs at <https://learnify.tertiaryinfotech.com> as a Docker container on a Hostinger VPS managed by [Coolify](https://coolify.tertiarytraining.com). This guide covers the full setup: database, application, domain/TLS, the GitHub push webhook, migrations, one-off commands, backups and troubleshooting.

How the pieces fit:

| Piece | What it is |
|---|---|
| Image | Built from the repo's `Dockerfile` — Next.js standalone output on Node 22 |
| Boot | `docker-entrypoint.sh` runs `prisma migrate deploy`, then `node server.js` |
| Database | PostgreSQL 17, a Coolify-managed container on the same server |
| Files | Persistent volume at `/app/storage` (`STORAGE_DIR`) for uploads and SCORM packages when Cloudinary is not configured |
| TLS | Traefik (Coolify's proxy) + Let's Encrypt, TLS-ALPN challenge |
| CI/CD | GitHub webhook on push to `main` → Coolify rebuild. GitHub Actions (`.github/workflows/ci.yml`) only lints, typechecks and test-builds the image |

---

## Prerequisites

- A Coolify instance (v4) with a server connected — here the Hostinger VPS itself.
- The GitHub repo <https://github.com/alfredang/ai-learnify> reachable by Coolify (public, or via a GitHub App / deploy key).
- A DNS `A` record for the production hostname pointing at the VPS IP (and `AAAA` if you use IPv6). Ports 80 and 443 open.
- Secrets ready: `AUTH_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `CRON_SECRET` (each from `openssl rand -base64 32`), plus the OpenAI / DeepSeek keys and any optional Stripe / Cloudinary / Resend keys.

## 1. Create the PostgreSQL 17 database

1. Coolify → **Projects** → your project → **+ New Resource** → **Database** → **PostgreSQL**.
2. Pick the **17** image tag, name it (e.g. `learnify-db`), and start it.
3. Leave **Make it publicly available** off — the app reaches it over the internal `coolify` Docker network.
4. Copy the **internal** connection string from the resource page; it becomes `DATABASE_URL`. It looks like `postgresql://postgres:<password>@<container-name>:5432/postgres`.

## 2. Create the application

1. **+ New Resource** → **Application** → **Public Repository** (or **GitHub App** if installed) → repository URL above, branch `main`.
2. **Build Pack:** `Dockerfile`. Dockerfile location `/Dockerfile`, base directory `/`.
3. **Network:** the application must be on the `coolify` network (default) so it can resolve the database container by name. **Ports Exposes:** `3000`.
4. **Persistent Storage** → **+ Add** → Volume mount:
   - Name: `learnify-storage`
   - Destination path: `/app/storage`
   This is where local uploads and generated SCORM packages live. Without it they are lost on every redeploy.
5. **Health check** is built into the image (`GET /api/health`); no extra configuration is needed.

### Environment variables

Add these under the application's **Environment Variables** tab. Mark `NEXT_PUBLIC_*` variables as **Build Variable** too — Next.js inlines them at build time and the `Dockerfile` reads them as build args.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Internal connection string from step 1 |
| `AUTH_SECRET` | yes | 32+ chars |
| `AUTH_URL` | yes | `https://learnify.tertiaryinfotech.com` |
| `AUTH_TRUST_HOST` | yes | `true` — the app sits behind Traefik |
| `NEXT_PUBLIC_APP_URL` | yes (build + runtime) | `https://learnify.tertiaryinfotech.com` |
| `CREDENTIAL_ENCRYPTION_KEY` | yes | AES-256-GCM key for per-academy AI credentials |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/*` |
| `STORAGE_DIR` | yes | `/app/storage` (matches the volume mount; also the image default) |
| `OPENAI_API_KEY` | AI | Primary provider. Alternatively ChatGPT OAuth: `OPENAI_OAUTH_ACCESS_TOKEN` + optional `OPENAI_OAUTH_REFRESH_TOKEN`, `OPENAI_ACCOUNT_ID`. `OPENAI_MODEL` overrides `gpt-6.1-sol` |
| `DEEPSEEK_API_KEY` | AI | Automatic fallback. Optional `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`), `DEEPSEEK_MODEL` (default `deepseek-flash`) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | optional | Paid checkout. Webhook endpoint: `https://<host>/api/webhooks/stripe` |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | optional | Media CDN; the two `NEXT_PUBLIC_*` values are build variables |
| `RESEND_API_KEY`, `EMAIL_FROM` | optional | Invoices and access-reminder emails |
| `AUTH_GOOGLE_*`, `AUTH_GITHUB_*` | optional | Staff OAuth only |

Academies can also store their own AI credentials under **Academy Settings → Integrations → AI Provider**; those are encrypted with `CREDENTIAL_ENCRYPTION_KEY`, so rotate that key only with a migration plan.

## 3. Domain and HTTPS

1. Application → **General** → **Domains**: `https://learnify.tertiaryinfotech.com` (include the scheme).
2. Coolify writes the Traefik router labels and requests a Let's Encrypt certificate using the **TLS-ALPN** challenge on port 443. No manual certbot step.
3. Issuance takes under a minute once DNS resolves to the VPS. Check **Logs** on the `coolify-proxy` container if the site still serves the Traefik default certificate.

HTTP → HTTPS redirect is handled by Traefik; the app additionally sets HSTS in `next.config.ts`.

## 4. GitHub push webhook (CI/CD)

Coolify rebuilds on every push to `main` through a manual GitHub webhook:

1. Application → **Webhooks** → **GitHub** section. Copy the **Manual webhook URL** (`https://coolify.tertiarytraining.com/webhooks/source/github/events/manual`) and set/copy the **GitHub webhook secret**. Save.
2. GitHub repo → **Settings → Webhooks → Add webhook**:
   - **Payload URL:** the URL from step 1
   - **Content type:** `application/json`
   - **Secret:** the same secret
   - **Which events:** *Just the push event*
   - Active: checked
3. Push a commit to `main`. GitHub's **Recent Deliveries** should show a `200`, and Coolify's **Deployments** tab should show a new build.

Pull requests do not deploy. GitHub Actions still runs `prisma validate`, `tsc --noEmit`, `npm run lint` and a throwaway `docker build` on every PR and push so a broken commit is caught before Coolify rebuilds it.

## 5. First deploy and migrations

Click **Deploy**. The build runs `npm ci`, `prisma generate` and `next build`, then the runtime image starts via `docker-entrypoint.sh`, which:

1. Fails fast if `DATABASE_URL` is unset.
2. Runs `prisma migrate deploy --schema ./prisma/schema.prisma` (unless `SKIP_MIGRATIONS=1`). On a fresh database this creates every table from `prisma/migrations/`.
3. Creates `STORAGE_DIR` if missing and starts `node server.js` on port 3000.

Migrations therefore run automatically on every boot; you never run `db:push` against production. Verify with `curl -s https://learnify.tertiaryinfotech.com/api/health` — expect `db.ok: true` and `integrations.openai` / `integrations.deepseek` reflecting your keys.

To seed a first Platform Owner, run the seed once as a one-off command (below) and then change the seeded passwords. Do not re-run the seed on a live database.

## 6. Running a one-off command in the container

Application → **Terminal** (Coolify opens a shell in the running container), or from the VPS over SSH:

```bash
# find the container
docker ps --filter "name=<application-uuid>" --format '{{.Names}}'

# open a shell
docker exec -it <container> sh

# examples
./node_modules/.bin/prisma migrate status --schema ./prisma/schema.prisma
./node_modules/.bin/prisma migrate deploy --schema ./prisma/schema.prisma
node -e "console.log(process.env.STORAGE_DIR)"
```

The runtime image is the standalone build: it has the Prisma CLI and engines but not `tsx` or the full `node_modules`. For `npm run db:seed` or other `scripts/*.ts` utilities, run them from your workstation with `DATABASE_URL` set to a temporarily public database URL (enable **Make it publicly available** on the database resource, run, then disable), or build a throwaway image from the `build` stage:

```bash
docker build --target build -t ai-learnify:tools .
docker run --rm --network coolify -e DATABASE_URL="$DATABASE_URL" ai-learnify:tools npm run db:seed
```

## 7. Cron jobs

Coolify → application → **Scheduled Tasks**, or system cron on the VPS. Each job must send the bearer token:

```bash
# nightly ledger invariant
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://learnify.tertiaryinfotech.com/api/cron/ledger-invariant
# daily access reminders
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://learnify.tertiaryinfotech.com/api/cron/access-reminders
```

## 8. Backups

| What | How |
|---|---|
| PostgreSQL | Database resource → **Backups** → add a schedule (daily) with an S3-compatible destination configured under Coolify **Settings → S3 Storages**. Coolify runs `pg_dump` and uploads it. Also keep the manual `pg_dump` / restore drill in `docs/runbook.md` §2. |
| `/app/storage` volume | Not covered by the database backup. Back up the Docker volume (`docker run --rm -v learnify-storage:/data -v $PWD:/out alpine tar czf /out/storage-$(date +%F).tgz -C /data .`) on a cron, and push the archive to the same S3 bucket. |
| Environment variables | Export from the application's **Environment Variables** tab (or keep them in a password manager). `CREDENTIAL_ENCRYPTION_KEY` in particular is unrecoverable if lost. |

Test a restore quarterly, not just the backup.

## 9. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Build fails with `Invalid or missing environment variables` | `src/lib/env.ts` validates at build time. The `Dockerfile` supplies placeholders for `DATABASE_URL` and `AUTH_SECRET`; make sure `NEXT_PUBLIC_APP_URL` is set as a **build** variable. |
| Container restarts in a loop, log shows `[entrypoint] DATABASE_URL is not set` | The variable is missing or not marked for runtime. |
| `prisma migrate deploy` fails with `P1001` (can't reach database) | App and DB are on different Docker networks, or the DB container is down. Confirm both are on `coolify` and use the internal hostname, not `localhost`. |
| `prisma migrate deploy` fails with `P3009` (failed migration) | A previous migration half-applied. Inspect with `prisma migrate status`, fix the data, then `prisma migrate resolve --applied <name>` from the container terminal. |
| `AUTH_URL` / `UntrustedHost` errors, login redirects to `localhost` | Set `AUTH_URL` to the public HTTPS origin and `AUTH_TRUST_HOST=true`. |
| Site serves Traefik's default certificate | DNS not yet pointing at the VPS, or port 443 blocked. Check `coolify-proxy` logs; Let's Encrypt retries automatically. |
| Uploads or SCORM packages disappear after redeploy | The `/app/storage` volume is not mounted. Add it under **Persistent Storage** and redeploy. |
| Large video upload fails (413) | Raise Traefik's request body limit for this router (Coolify → application → **Advanced** → custom labels) and confirm `client_max_body_size` on any upstream proxy. SCORM Studio accepts up to 500 MB. |
| Stripe webhook signature failures | `STRIPE_WEBHOOK_SECRET` must match the endpoint registered for `https://<host>/api/webhooks/stripe`; Traefik passes the raw body through unchanged. |
| AI Assist returns `provider_unavailable` | Neither OpenAI nor DeepSeek credentials are valid. `/api/health` shows which integration flags are on; check the academy-level credential under Integrations → AI Provider if the global one is set. |
| Webhook push does not trigger a build | GitHub → Webhooks → Recent Deliveries: a `4xx` means the secret or URL is wrong; `200` with no deployment means the push was not to `main`. |

For day-two operations (incidents, restore drills, on-call) see `docs/runbook.md`.
