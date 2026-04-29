-- Spec §16 — LedgerEntry rows are immutable. Application-level checks are
-- best-effort; this trigger enforces the invariant at the database layer
-- so a misbehaving code path or direct SQL session cannot quietly mutate
-- the ledger.
--
-- Allowed: INSERT (writeLedger / reverseLedger).
-- Allowed: UPDATE of `payoutBatchId` only — that's a non-financial linkage
--          stamped when a batch claims a leg. The amount, type, beneficiary,
--          parentTxnId, etc. are frozen at write time.
-- Forbidden: DELETE.

CREATE OR REPLACE FUNCTION ledger_entry_block_destructive_writes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'LedgerEntry is append-only (spec §16). Use reverseLedger() to emit REFUND_* counter-entries.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW."parentTxnId" IS DISTINCT FROM OLD."parentTxnId"
       OR NEW."academyId" IS DISTINCT FROM OLD."academyId"
       OR NEW."productType" IS DISTINCT FROM OLD."productType"
       OR NEW."productId" IS DISTINCT FROM OLD."productId"
       OR NEW."userId" IS DISTINCT FROM OLD."userId"
       OR NEW."beneficiaryUserId" IS DISTINCT FROM OLD."beneficiaryUserId"
       OR NEW."entryType" IS DISTINCT FROM OLD."entryType"
       OR NEW."amountMinor" IS DISTINCT FROM OLD."amountMinor"
       OR NEW."currency" IS DISTINCT FROM OLD."currency"
       OR NEW."payoutGroup" IS DISTINCT FROM OLD."payoutGroup"
       OR NEW."reversalOfId" IS DISTINCT FROM OLD."reversalOfId"
       OR NEW."promoCodeId" IS DISTINCT FROM OLD."promoCodeId"
       OR NEW."notes" IS DISTINCT FROM OLD."notes"
       OR NEW."metadata"::text IS DISTINCT FROM OLD."metadata"::text
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
    THEN
      RAISE EXCEPTION 'LedgerEntry rows are immutable except for payoutBatchId (spec §16). Refusing UPDATE of financial fields.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ledger_entry_immutability ON "LedgerEntry";
CREATE TRIGGER ledger_entry_immutability
BEFORE UPDATE OR DELETE ON "LedgerEntry"
FOR EACH ROW EXECUTE FUNCTION ledger_entry_block_destructive_writes();
