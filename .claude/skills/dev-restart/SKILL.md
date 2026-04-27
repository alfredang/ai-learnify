---
name: dev-restart
description: Kill dev server, regenerate Prisma client, push schema, and restart. Activated when the user says "restart dev", "kill and rerun", "refresh prisma", or after schema changes.
---

# Dev Restart Workflow

Use this workflow when the dev server needs a full restart, typically after Prisma schema changes or when processes get stuck.

## When to Use

- After modifying `prisma/schema.prisma`
- When seeing "Cannot read properties of undefined (reading 'findMany')" or similar Prisma errors
- When the dev server is stuck or using a stale Prisma client
- When port 3000 is occupied by a zombie process
- When the user asks to "restart", "kill and rerun", or "refresh"

## Steps

### 1. Kill all Node processes (Windows)

The dev server and any background Node processes must be fully stopped before Prisma can regenerate. On Windows, the query engine DLL gets locked by running processes.

```bash
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"
```

### 2. Clean stale locks

Remove the Next.js dev lock file and optionally the stale Prisma client:

```bash
rm -rf .next/dev/lock
```

If Prisma generate fails with EPERM, also clear the cached client:

```bash
rm -rf node_modules/.prisma/client
```

### 3. Regenerate Prisma Client

```bash
npx prisma generate
```

This must succeed before the dev server starts. If it fails with EPERM, repeat step 1 and clear the client cache per step 2.

### 4. Push schema to database (if schema changed)

Only needed when models/fields were added, removed, or modified in `prisma/schema.prisma`:

```bash
npx prisma db push
```

This can take 30-60 seconds for remote databases (Neon). Run with a longer timeout.

### 5. Start dev server

```bash
npm run dev
```

Run in background. Verify it starts on port 3000 (not a fallback port). If it falls back to another port, repeat step 1 — a zombie process is still holding port 3000.

## Quick Reference (copy-paste sequence)

For the common "schema changed, restart everything" flow:

```bash
# Kill all node processes
powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue"

# Clean locks
rm -rf .next/dev/lock

# Regenerate and push (if EPERM, add: rm -rf node_modules/.prisma/client before generate)
npx prisma generate && npx prisma db push

# Start dev server
npm run dev
```

## Troubleshooting

| Problem | Fix |
|---|---|
| `EPERM: operation not permitted` on prisma generate | Kill all node processes first, then `rm -rf node_modules/.prisma/client` |
| Port 3000 still in use after killing processes | Wait 2-3 seconds for OS to release the port, or use `powershell.exe -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue"` to find the PID |
| `Cannot read properties of undefined (reading 'findMany')` | The running server has a stale Prisma client. Full restart needed (all 5 steps). |
| `Unable to acquire lock at .next/dev/lock` | Another Next.js dev instance is running. Kill it first, then `rm -rf .next/dev/lock` |
| `prisma db push` hangs | Remote DB (Neon) can be slow. Use a 60+ second timeout. Cold starts on free tier take longer. |
