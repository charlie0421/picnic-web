-- Atomic processing of a successful PayPal capture.
--
-- Why this RPC exists:
--   The previous capture-order route performed four sequential writes
--   (insert receipt → increment star_candy → insert star_candy_history →
--   increment + insert bonus). If any step after the receipt insert failed,
--   the route still returned success: true, and the user could not retry
--   because the next attempt would hit the receipts unique index and be
--   short-circuited as "already processed". The result was permanently lost
--   star_candy credit.
--
--   Wrapping all writes in a single PL/pgSQL function executes them in one
--   implicit transaction: any failure rolls back the receipt insert too,
--   restoring the user's ability to retry safely. The unique violation on
--   the receipts partial index remains the canonical "already processed"
--   signal and is surfaced to the caller as a NULL return.
--
-- Return contract:
--   - jsonb { receipt_id: bigint, granted_star_candy: int, granted_bonus: int }
--     on success.
--   - NULL when the row already exists (idempotent retry of an already-credited
--     capture). The caller should treat this as "already processed".
--   - Any other error is re-raised to the caller and rolls back the
--     transaction in full.
--
-- Idempotency layers (defense in depth):
--   1. Pre-check on star_candy_history / star_candy_bonus_history by
--      transaction_id BEFORE any write. This guards against legacy desync
--      states where history rows already exist but the matching receipt does
--      not (e.g. admin-deleted receipt, partially-applied legacy data, manual
--      backfill). Without this check, the receipts INSERT would succeed, then
--      the history INSERT would raise 23505 against
--      ux_star_candy_history_tx / uq_sc_bonus_user_tx, rolling back the entire
--      transaction every retry — permanent stuck state.
--   2. unique_violation trap on the receipts insert (canonical "already
--      processed" path via receipts_web_completed_unique partial index).
--   Both layers return NULL so the caller treats the call as a no-op.

-- SECURITY: This function is SECURITY DEFINER and writes directly to balance
-- columns (user_profiles.star_candy / star_candy_bonus) and history tables. It
-- intentionally trusts the caller-supplied amount/product arguments — there is
-- NO authorization check inside the function. The capture-order route is
-- expected to (1) authenticate the request via user JWT, (2) verify that the
-- captured PayPal order matches the authenticated user, and (3) re-derive
-- amounts from the products table before invoking this RPC.
--
-- For that contract to hold, this function MUST NOT be callable by a normal
-- logged-in user. EXECUTE is granted ONLY to service_role; the route obtains a
-- service-role client (separate from the user-bound supabase client used for
-- auth) and invokes this RPC server-side after all validations pass. Granting
-- EXECUTE to `authenticated` would let any logged-in user POST directly to
-- /rest/v1/rpc/process_paypal_capture with arbitrary star_candy / bonus values
-- and credit themselves — bypassing every check the route performs.
CREATE OR REPLACE FUNCTION public.process_paypal_capture(
  p_user_id uuid,
  p_order_id text,
  p_capture_id text,
  p_product_id text,
  p_star_candy int,
  p_bonus_amount int,
  p_amount text,
  p_currency text,
  p_status text,
  p_environment text,
  p_payment_details jsonb,
  p_verification_data jsonb,
  p_bonus_expiry timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt_id bigint;
  v_transaction_id text := 'PAYPAL_' || p_order_id;
  v_receipt_data jsonb;
BEGIN
  -- Caller must be service_role; this function trusts caller-supplied amounts
  -- because the route validates them server-side first (auth check, user-id
  -- match against captured order, server-derived star_candy / bonus from the
  -- products table). See the GRANT block at the bottom of this file.
  v_receipt_data := jsonb_build_object(
    'order_id', p_order_id,
    'capture_id', p_capture_id,
    'amount', p_amount,
    'currency', p_currency,
    'status', p_status,
    'payment_details', p_payment_details
  );

  -- 0. Pre-check: if star_candy_history or star_candy_bonus_history already
  --    has this transaction_id, the user has already been credited (possibly
  --    by a legacy code path or manual operation) and the matching receipt
  --    row may have been deleted out from under us. Returning NULL here makes
  --    the call idempotent. Without this check, the receipts INSERT would
  --    succeed and then the star_candy_history INSERT (or bonus INSERT) would
  --    hit ux_star_candy_history_tx / uq_sc_bonus_user_tx (23505), rolling
  --    back the receipt insert and leaving every retry permanently stuck.
  IF EXISTS (
    SELECT 1 FROM public.star_candy_history
    WHERE transaction_id = v_transaction_id
  ) OR EXISTS (
    SELECT 1 FROM public.star_candy_bonus_history
    WHERE user_id = p_user_id
      AND transaction_id = v_transaction_id
  ) THEN
    RAISE LOG 'process_paypal_capture: idempotent skip via history pre-check, transaction_id=%, user_id=%, order_id=%',
      v_transaction_id, p_user_id, p_order_id;
    RETURN NULL;
  END IF;

  -- 1. Insert the receipt. The partial unique index
  -- (receipts_web_completed_unique) raises 23505 if a concurrent or prior
  -- capture already credited this orderID; we trap that case and return NULL
  -- to signal idempotent no-op to the caller.
  BEGIN
    INSERT INTO public.receipts (
      user_id,
      product_id,
      receipt_data,
      receipt_hash,
      status,
      platform,
      environment,
      verification_data
    ) VALUES (
      p_user_id,
      p_product_id,
      v_receipt_data::text,
      p_order_id,
      'completed',
      'web',
      p_environment,
      p_verification_data
    )
    RETURNING id INTO v_receipt_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE LOG 'process_paypal_capture: idempotent skip via receipts unique index, order_id=%, user_id=%',
        p_order_id, p_user_id;
      RETURN NULL;
  END;

  -- 2. Star candy history + balance.
  INSERT INTO public.star_candy_history (
    user_id,
    amount,
    type,
    transaction_id
  ) VALUES (
    p_user_id,
    p_star_candy,
    'PURCHASE'::candy_history_type,
    v_transaction_id
  );

  UPDATE public.user_profiles
  SET star_candy = star_candy + p_star_candy,
      updated_at = now()
  WHERE id = p_user_id;

  -- 3. Bonus history + balance (only when applicable).
  IF p_bonus_amount > 0 THEN
    INSERT INTO public.star_candy_bonus_history (
      user_id,
      amount,
      remain_amount,
      type,
      transaction_id,
      expired_dt
    ) VALUES (
      p_user_id,
      p_bonus_amount,
      p_bonus_amount,
      'PURCHASE',
      v_transaction_id,
      p_bonus_expiry
    );

    UPDATE public.user_profiles
    SET star_candy_bonus = star_candy_bonus + p_bonus_amount,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'granted_star_candy', p_star_candy,
    'granted_bonus', p_bonus_amount
  );
END;
$$;

COMMENT ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) IS
  'Atomically records a completed PayPal web capture: inserts the receipt, '
  'records star_candy / bonus history, and increments user balances in a '
  'single transaction. Idempotency is enforced by two layers: (1) a pre-check '
  'against star_candy_history / star_candy_bonus_history by transaction_id '
  '(guards against legacy desync where history exists without receipt), and '
  '(2) the receipts_web_completed_unique partial index on the receipts INSERT. '
  'Returns NULL in either idempotent path; any other internal failure rolls '
  'back the entire transaction so the user can safely retry the capture. '
  'Both idempotent paths emit a RAISE LOG line distinguishing which layer '
  'short-circuited (search Postgres logs for "process_paypal_capture: idempotent").';

-- Limit who can invoke this function. SECURITY DEFINER + caller-trusted
-- amount/product args mean we cannot allow direct invocation by normal
-- logged-in users. The capture-order route uses a service-role client to call
-- this RPC after performing auth + amount validation; that is the only
-- supported caller path.
REVOKE ALL ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) TO service_role;
