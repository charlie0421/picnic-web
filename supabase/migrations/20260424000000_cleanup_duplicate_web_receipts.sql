-- Historical cleanup of duplicate web receipt rows so the partial unique index
-- added in the next migration (20260424000001_add_receipts_web_unique_index)
-- can be created without conflict.
--
-- Background incident (2025-11-11):
--   A single PortOne web order produced 53 rows with
--   receipt_hash = 'PAY_1762841580152_dcvjip8k0', all status = 'completed'.
--   Root cause was a TOCTOU window in the capture/checkout flow that allowed
--   concurrent inserts of the same web receipt. The follow-up partial unique
--   index closes that window at the DB level, but pre-existing duplicate rows
--   would block its creation.
--
-- Cleanup policy:
--   Preserve the earliest row (oldest created_at) and re-mark the rest as
--   status = 'duplicate'. This is the same convention iOS/Android already use
--   for App Store / Play Store re-validations, so downstream queries that
--   filter on status = 'completed' continue to behave correctly. No money flow
--   is changed by this update — only the status marker.
--
-- This migration is intentionally split from the CREATE INDEX CONCURRENTLY
-- migration that follows it. The cleanup UPDATE is safe to run inside a
-- transaction; the concurrent index build is not (CREATE INDEX CONCURRENTLY
-- cannot run inside a transaction block).

BEGIN;

UPDATE public.receipts
SET status = 'duplicate'
WHERE id IN (
  SELECT id FROM public.receipts
  WHERE receipt_hash = 'PAY_1762841580152_dcvjip8k0'
    AND platform = 'web'
    AND status = 'completed'
  ORDER BY created_at ASC
  OFFSET 1
);

COMMIT;
