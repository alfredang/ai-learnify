-- Dev-only cleanup. Drop all ledger + invoices before re-running verify.
TRUNCATE TABLE "LedgerEntry" RESTART IDENTITY CASCADE;
TRUNCATE TABLE "Invoice" RESTART IDENTITY CASCADE;
DELETE FROM "PromoCode" WHERE code = 'PHASE4TEST';
