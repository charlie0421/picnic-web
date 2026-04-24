-- Enforce idempotency for web payment receipts at the DB level to close the
-- TOCTOU race in PayPal capture-order and PortOne checkout flows.
--
-- =====================================================================
--   MANUAL APPLICATION REQUIRED — DO NOT APPLY VIA `supabase db push`
-- =====================================================================
--
-- This migration MUST be applied via the Supabase Dashboard SQL Editor
-- (or `psql` invoked WITHOUT a transaction, e.g. `psql -1` is forbidden;
-- use plain `psql -f` with autocommit). It MUST NOT be applied via
-- `supabase db push` or `supabase migration up`.
--
-- Why: the Supabase CLI wraps each migration file in an implicit
-- BEGIN/COMMIT before executing it (see supabase/cli#2898). PostgreSQL
-- forbids `CREATE INDEX CONCURRENTLY` inside a transaction block and will
-- abort the migration with:
--     ERROR: 25001  CREATE INDEX CONCURRENTLY cannot run inside a
--                   transaction block
--
-- Deployment runbook (perform in this exact order):
--
--   1. Apply the cleanup migration via the CLI normally:
--        supabase db push  -- picks up 20260424000000_cleanup_duplicate_web_receipts.sql
--      (That file is plain DML and is safe inside the CLI's transaction wrapper.)
--
--   2. Open the Supabase Dashboard → SQL Editor for project
--      `xtijtefcycoeqludlngc`.
--
--   3. Copy the DDL block at the bottom of THIS file (the CREATE INDEX
--      CONCURRENTLY statement and the COMMENT ON INDEX statement) and run
--      them one at a time in the SQL Editor. The SQL Editor runs each
--      submission outside an explicit transaction, so CONCURRENTLY works.
--
--   4. Verify the index exists and is VALID:
--        SELECT indexname, indexdef
--          FROM pg_indexes
--         WHERE schemaname = 'public'
--           AND tablename  = 'receipts'
--           AND indexname  = 'receipts_web_completed_unique';
--
--        SELECT i.relname, ix.indisvalid, ix.indisready
--          FROM pg_class i
--          JOIN pg_index ix ON ix.indexrelid = i.oid
--         WHERE i.relname = 'receipts_web_completed_unique';
--      Expect: indisvalid = true, indisready = true.
--
--   5. Mark this migration as applied so the CLI does not try to re-run it
--      on the next `supabase db push`:
--        INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
--        VALUES (
--          '20260424000001',
--          'add_receipts_web_unique_index',
--          ARRAY[
--            'CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS receipts_web_completed_unique ON public.receipts (receipt_hash) WHERE platform = ''web'' AND status = ''completed'' AND receipt_hash IS NOT NULL;'
--          ]
--        );
--
-- Failure recovery:
--   If CONCURRENTLY mid-build fails (e.g. a duplicate slipped in between
--   the cleanup migration and this run), Postgres leaves an INVALID index
--   that will silently be ignored by the planner but blocks a retry of
--   the same name. Drop it before retrying:
--
--     DROP INDEX CONCURRENTLY public.receipts_web_completed_unique;
--
--   Then re-identify any new duplicates with the diagnostic in
--   20260424000000_cleanup_duplicate_web_receipts.sql, clean them up,
--   and re-run step 3.
--
-- Why we accept this awkward two-step process:
--   The `receipts` table is hot-path payment infrastructure. A non-
--   CONCURRENTLY CREATE INDEX takes a ShareLock and blocks all
--   INSERT/UPDATE/DELETE on `receipts` for the duration of the build,
--   which on a sizeable receipts table is tens of seconds of stalled
--   live payments. The manual SQL Editor step is a one-time cost; the
--   zero-downtime build is permanent.
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
--
-- ============== ACTUAL DDL BELOW (copy into SQL Editor) ==============

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
