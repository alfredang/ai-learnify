#!/bin/sh
# Apply pending Prisma migrations, then start the Next.js standalone server.
# Set SKIP_MIGRATIONS=1 to boot without touching the database.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "[entrypoint] DATABASE_URL is not set" >&2
  exit 1
fi

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] applying Prisma migrations…"
  # Call the CLI entry directly (not the .bin symlink) so Prisma can find its
  # bundled WASM next to build/index.js.
  node ./node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma
fi

mkdir -p "${STORAGE_DIR:-/app/storage}"
echo "[entrypoint] starting Next.js on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec "$@"
