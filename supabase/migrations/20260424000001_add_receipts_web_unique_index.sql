-- Enforce idempotency for web payment receipts at the DB level to close the
-- TOCTOU race in PayPal capture-order and PortOne checkout flows.
--
-- IMPORTANT: This migration MUST run outside of a transaction.
--   CREATE INDEX CONCURRENTLY cannot execute inside a transaction block
--   (Postgres raises 25001). The Supabase CLI / migrate tooling auto-wraps a
--   migration file in BEGIN/COMMIT only when it contains multiple statements
--   or other non-concurrent DDL. To guarantee no transaction wrapping, this
--   file contains exactly one DDL statement (the CREATE INDEX) plus comments
--   and a single COMMENT ON INDEX. Do not add other statements here.
--
-- Why CONCURRENTLY:
--   `receipts` is a hot-path payment table. A non-concurrent index build takes
--   a ShareLock and blocks INSERT/UPDATE/DELETE for the duration of the build,
--   which on a sizeable receipts table can mean tens of seconds of stalled
--   payment processing. CONCURRENTLY trades a longer build for zero write
--   downtime.
--
-- Scope choice: platform = 'web' AND status = 'completed' only.
--   - iOS/Android receipts legitimately repeat the same receipt_hash across
--     rows (App Store / Play Store re-validation is surfaced with
--     status = 'duplicate'). A cross-platform unique index would clash with
--     thousands of these intentional rows.
--   - Web payments (PayPal orderID, PortOne PAY_xxx) are expected to be unique
--     per capture. A duplicate completed row there indicates a real race or
--     double-credit.
--
-- Pre-existing duplicates were normalized by the companion migration
-- 20260424000000_cleanup_duplicate_web_receipts.sql.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS receipts_web_completed_unique
  ON public.receipts (receipt_hash)
  WHERE platform = 'web'
    AND status = 'completed'
    AND receipt_hash IS NOT NULL;

COMMENT ON INDEX public.receipts_web_completed_unique IS
  'Enforces idempotency for web payment receipts keyed by receipt_hash. '
  'Scoped to platform=web + status=completed to avoid clashing with iOS/Android '
  'duplicate markers. Application code (PayPal capture-order route, PortOne '
  'webhook) catches the resulting 23505 unique_violation as the canonical '
  '"already processed" signal.';
