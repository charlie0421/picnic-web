-- Enforce idempotency for web payment receipts at the DB level to close the
-- TOCTOU race in PayPal capture-order.
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
-- Historical cleanup: a single known incident on 2025-11-11 produced 53 rows
-- with receipt_hash = 'PAY_1762841580152_dcvjip8k0', all status='completed'.
-- We preserve the earliest row and re-mark the rest as 'duplicate' so the
-- partial unique index can apply. No money flow is changed by this update —
-- only the status marker, matching the iOS/Android convention.

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

CREATE UNIQUE INDEX IF NOT EXISTS receipts_web_completed_unique
  ON public.receipts (receipt_hash)
  WHERE platform = 'web'
    AND status = 'completed'
    AND receipt_hash IS NOT NULL;

COMMENT ON INDEX public.receipts_web_completed_unique IS
  'Enforces idempotency for web payment receipts keyed by receipt_hash. '
  'Scoped to platform=web + status=completed to avoid clashing with iOS/Android '
  'duplicate markers. Application code (PayPal capture-order route) catches '
  'the resulting 23505 unique_violation as the canonical "already processed" signal.';

COMMIT;
