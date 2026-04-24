-- Add a unique constraint on receipts.receipt_hash to enforce idempotency at the
-- DB level and close a TOCTOU race in PayPal capture-order: a concurrent double
-- capture (same orderID submitted twice) would otherwise pass the application
-- "existingReceipt" check on both requests and insert two rows, causing a
-- duplicate star_candy grant.
--
-- We use a partial unique index (NULLs excluded) rather than a column constraint
-- because legacy receipts may have NULL receipt_hash and a plain UNIQUE
-- constraint would still allow only one NULL in some Postgres semantics, but
-- more importantly we want this to be idempotent and CREATE UNIQUE INDEX
-- IF NOT EXISTS is the cleanest way to achieve that.
--
-- If pre-existing duplicate non-NULL receipt_hash rows exist, this migration
-- will fail. Run the diagnostic below first to identify them:
--   SELECT receipt_hash, COUNT(*) FROM public.receipts
--   WHERE receipt_hash IS NOT NULL
--   GROUP BY receipt_hash HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_receipt_hash_unique
  ON public.receipts (receipt_hash)
  WHERE receipt_hash IS NOT NULL;

COMMENT ON INDEX public.receipts_receipt_hash_unique IS
  'Enforces idempotency for payment receipts keyed by orderID/receipt_hash. '
  'Application code (PayPal capture-order route) catches the resulting 23505 '
  'unique_violation as the canonical "already processed" signal.';
