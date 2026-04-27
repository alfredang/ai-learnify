# Operations Runbook

Phase 10 — Spec §18 operational playbook. Covers routine ops, backup / restore, and incident response. Update this file whenever a procedure changes in production.

---

## 1. Routine operations

### Daily

| Task | Where | Acceptance |
|---|---|---|
| Uptime check | Uptime monitor hitting `/api/health` | 200 response, `db.ok = true`, `db.latencyMs < 500` |
| Ledger invariant | `/api/cron/ledger-invariant` nightly run | 0 unbalanced txns; see `/platform` dashboard red banner |
| Access reminders | `/api/cron/access-reminders` | Reminder counts logged in `AuditLog` by tag (M1 / M2 / T-14d) |

### Weekly

- Review `AuditLog` for `ai.assist` token spikes (Phase 7 cost control).
- Review `PayoutBatch` rows in DRAFT for > 14 days — approve or cancel.
- Run `prisma validate` + `npm run lint` locally against `main` to confirm no drift.

### Monthly

- Rotate any OAuth refresh tokens the vault system doesn't auto-refresh.
- Review deprecated Prisma fields flagged in `schema.prisma` comments (Enrollment, legacy UserRole).
- Full DB backup verification (see §2).

---

## 2. Backup and restore

### Postgres (Neon)

Neon provisions point-in-time-recovery (PITR) automatically on paid tiers. For self-managed Postgres, configure WAL archiving separately.

**Manual backup (any Postgres):**

```bash
# Dump everything to a plain-SQL file
pg_dump "$DATABASE_URL" --no-owner --no-acl --format=custom \
  --file="learnify-$(date -u +%Y%m%d-%H%M%S).dump"

# Upload to cold storage (S3 / R2 / Backblaze)
aws s3 cp learnify-*.dump s3://learnify-backups/daily/
```

Retention target: **daily for 30 days, monthly for 7 years** (audit trail is part of the compliance surface per spec §18).

**Restore drill** — must be exercised quarterly, not just documented:

```bash
# 1. Create a fresh empty DB
createdb learnify_restore_test

# 2. Restore the dump
pg_restore --no-owner --no-acl --clean --if-exists \
  --dbname=learnify_restore_test learnify-YYYYMMDD-HHMMSS.dump

# 3. Run the invariant probe against the restored DB
DATABASE_URL="postgresql://.../learnify_restore_test" npx tsx scripts/verify-ledger.ts
```

A successful drill means: `LedgerEntry` sum per `parentTxnId` = 0, no unique-constraint conflicts, `AccessGrant.expiresAt` distribution matches the original within ±1 day.

### Cloudinary

Cloudinary is the source of truth for course video, PDFs, voice-over slide decks, and (from Phase 6) SCORM packages. It has no built-in export.

- **Public IDs are the join key.** Every asset reference in Postgres (`Lecture.videoPublicId`, `Certificate.pdfUrl`, `Course.thumbnail`) points at a Cloudinary public ID.
- **Disaster recovery contract:** the Postgres backup is authoritative for metadata; Cloudinary is authoritative for binaries. Restoring after a Cloudinary account loss requires re-uploading the blobs from a parallel S3 mirror.
- **Mirror strategy (recommended for production):** set up a Cloudinary webhook (`upload` notification) that pushes every new asset to a private S3 bucket. Not yet configured — mark as a follow-up in Phase 10b.

### Stripe

Stripe stores its own copy of every `Charge`, `PaymentIntent`, and `Transfer`. `LedgerEntry.metadata.stripePaymentIntentId` is the reverse lookup.

- To reconstruct any transaction from scratch, pull the full list of `charges` via the Stripe API and match by `payment_intent` to `LedgerEntry` rows.
- **Never** rely on Stripe for reporting: use `LedgerEntry`. Stripe is the payment processor, not the money-truth system.

---

## 3. Incident response

### P0 — Checkout failing for all learners

**Symptoms:** `/api/checkout/quote` or `/api/webhooks/stripe` returning 5xx; spike in `AuditLog` rows with failed-payment action.

1. Hit `/api/health` — is `db.ok` false? If yes, this is a DB incident (see below).
2. Check `STRIPE_WEBHOOK_SECRET` is set and matches the active Stripe webhook endpoint.
3. Confirm the learner's Stripe charge status in the Stripe dashboard. If the charge succeeded but our webhook didn't receive it, replay via the Stripe dashboard's "Resend" button.
4. If webhooks are replayed successfully, verify new `Purchase` and `AccessGrant` rows materialize. If not, pull `AuditLog` rows with `action='checkout.finalize.error'`.

### P0 — Unbalanced ledger

**Symptoms:** Platform Owner dashboard shows a red "N transactions with unbalanced ledger legs" banner, or `/api/cron/ledger-invariant` returns non-zero count.

1. Do **not** generate new payout batches until resolved — the pool sums will be wrong.
2. Run:
   ```sql
   SELECT "parentTxnId", SUM("amountMinor") AS delta, COUNT(*) AS legs
     FROM "LedgerEntry"
    GROUP BY "parentTxnId"
   HAVING SUM("amountMinor") <> 0
    ORDER BY ABS(SUM("amountMinor")) DESC;
   ```
3. For each unbalanced `parentTxnId`, check the event order: CHARGE, DISCOUNT (optional), MARKETER (optional), PLATFORM_SUPPORT (optional), TAX (optional), ACADEMY, DEVELOPER, and any REFUND_* reversals. The sum should always be zero.
4. If a leg is missing (e.g. webhook retry wrote CHARGE but not the shares), manually reconcile via `src/lib/ledger.ts#reverseLedger(parentTxnId)` + re-run the finalize via the admin refund-then-reissue flow. **Never** `UPDATE` or `DELETE` existing rows — the audit trail is the product.

### P1 — Database unreachable

**Symptoms:** `/api/health` returns 503 with `db.ok: false`; Postgres connection errors in logs.

1. Check the Neon dashboard for autoscale throttling or branch compute suspension.
2. If on free tier, the compute may suspend after inactivity. First request after suspension incurs ~1s latency — acceptable.
3. If the DB is genuinely down, enable a maintenance banner via a `FeatureFlag` (set `maintenance_mode` = true). The banner markup is up to the deploy.

### P2 — Stripe webhook signature verification failing

**Symptoms:** Stripe dashboard shows repeated 4xx to `/api/webhooks/stripe`.

1. Confirm `STRIPE_WEBHOOK_SECRET` matches the active webhook endpoint in Stripe's dashboard. Test and Live mode have different secrets.
2. Verify the raw body is not being transformed by a proxy (Vercel / Netlify preserve it by default; self-hosted edge deploys may not).
3. If the secret was rotated, ledger-finalize for missed events via the Stripe dashboard replay.

---

## 4. Deployment

### Pre-deploy

- [ ] `npm run lint` and `npm run build` pass locally.
- [ ] `prisma validate` passes. Any schema changes reviewed for breaking migrations.
- [ ] New env vars listed in `.env.example` AND in `src/lib/env.ts` schema.
- [ ] UAT checklist in `docs/uat-checklist.md` completed on staging.

### Deploy

Vercel preview branches run against the same Neon production DB by default — this is **wrong** for anything that mutates. Use a Neon preview branch per PR.

### Post-deploy

- [ ] Hit `/api/health` — all integrations expected to be on show `true`.
- [ ] Check Stripe webhook endpoint is still verified.
- [ ] Smoke test one full learner journey (see UAT checklist).

---

## 5. Backups and schedule

| Asset | Backup method | Frequency | Retention |
|---|---|---|---|
| Postgres | Neon PITR + weekly pg_dump to S3 | Continuous + weekly | 30d PITR, 7y cold |
| Cloudinary | Webhook mirror to S3 (not yet configured) | Real-time (planned) | Indefinite |
| Stripe | Native — no action needed | Continuous | Stripe's retention |
| AuditLog | Included in Postgres backup | As above | 7y per spec §18 |

---

## 6. On-call

Not formally rotated yet — Phase 10b task. Until then, platform owner is on-call for P0 and P1. P2 / P3 follow the weekly review cadence.

Keep a shared doc of incidents with: symptom, MTTR, root cause, preventive action. Phase 10b gets this into Notion or a runbook repo.
