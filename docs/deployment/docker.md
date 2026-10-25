# Deploy with Docker

The repository ships a production `Dockerfile` and `docker-entrypoint.sh` — the same image that Coolify builds for production (see [Coolify guide](coolify.md)). Use this page to run that image anywhere Docker runs.

## What the image does

- **Build stage:** `npm ci`, `prisma generate`, `next build` (standalone output) on Node 22.
- **Runtime stage:** copies only the standalone server, static assets, `public/`, the Prisma schema + migrations and the Prisma CLI. Runs as the unprivileged `node` user.
- **Entrypoint:** `docker-entrypoint.sh` fails fast without `DATABASE_URL`, runs `prisma migrate deploy` (skip with `SKIP_MIGRATIONS=1`), creates `STORAGE_DIR`, then starts `node server.js` on port 3000.
- **Health check:** `GET /api/health` every 30s.
- **Persistent data:** declare a volume at `/app/storage` (`STORAGE_DIR`) for local uploads and SCORM packages.

## Build the image

`NEXT_PUBLIC_*` values are inlined at build time, so pass them as build args:

```bash
docker build \
  --build-arg NEXT_PUBLIC_APP_URL=https://learnify.example.com \
  --build-arg NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME="" \
  --build-arg NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET="" \
  -t ai-learnify .
```

## Run with Docker

```bash
docker run -d --name learnify \
  -p 3000:3000 \
  --env-file .env \
  -e AUTH_TRUST_HOST=true \
  -e STORAGE_DIR=/app/storage \
  -v learnify-storage:/app/storage \
  ai-learnify
```

Migrations run automatically on boot; there is no separate `db:push` step.

## Docker Compose

```yaml
services:
  app:
    build:
      context: .
      args:
        NEXT_PUBLIC_APP_URL: ${NEXT_PUBLIC_APP_URL}
        NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: ${NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:-}
        NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET: ${NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET:-}
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/learnify
      AUTH_TRUST_HOST: "true"
      STORAGE_DIR: /app/storage
    volumes:
      - learnify_storage:/app/storage
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: learnify
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

volumes:
  postgres_data:
  learnify_storage:
```

```bash
docker compose up -d --build   # start
docker compose logs -f app     # tail logs
docker compose down            # stop (volumes are kept)
```

## Required environment

See `.env.example` for the full list. Minimum for a running container: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `AUTH_TRUST_HOST=true`, `NEXT_PUBLIC_APP_URL`, `CREDENTIAL_ENCRYPTION_KEY`, `CRON_SECRET`, `STORAGE_DIR`. Add `OPENAI_*` / `DEEPSEEK_*` for AI Assist and SCORM Studio, and the optional `STRIPE_*`, `CLOUDINARY_*`, `RESEND_*` keys as needed.

## One-off commands

```bash
# shell in the running container
docker compose exec app sh

# migration status
docker compose exec app ./node_modules/.bin/prisma migrate status --schema ./prisma/schema.prisma
```

The runtime image has no `tsx`, so run `npm run db:seed` and `scripts/*.ts` from a workstation pointed at the database, or from a `--target build` image:

```bash
docker build --target build -t ai-learnify:tools .
docker run --rm --network host -e DATABASE_URL="$DATABASE_URL" ai-learnify:tools npm run db:seed
```

## Production tips

1. Put the container behind a TLS-terminating reverse proxy (Traefik, Caddy, nginx) and keep `AUTH_TRUST_HOST=true`.
2. Raise the proxy's request-body limit if you use SCORM Studio (uploads up to 500 MB).
3. Back up both the Postgres volume and `/app/storage` — see `docs/runbook.md` §2.
4. Schedule `/api/cron/ledger-invariant` and `/api/cron/access-reminders` with `Authorization: Bearer $CRON_SECRET`.
