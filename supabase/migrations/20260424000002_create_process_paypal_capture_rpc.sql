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
  v_receipt_data := jsonb_build_object(
    'order_id', p_order_id,
    'capture_id', p_capture_id,
    'amount', p_amount,
    'currency', p_currency,
    'status', p_status,
    'payment_details', p_payment_details
  );

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
  'single transaction. Returns NULL when the receipt already exists '
  '(idempotent retry). Any internal failure rolls back the entire transaction '
  'so the user can safely retry the capture.';

-- Limit who can invoke this function. Application calls should come from the
-- server-side Supabase client running with the user JWT (authenticated role).
REVOKE ALL ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_paypal_capture(
  uuid, text, text, text, int, int, text, text, text, text, jsonb, jsonb, timestamptz
) TO authenticated, service_role;
