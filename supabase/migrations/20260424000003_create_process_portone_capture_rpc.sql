-- Atomic processing of a successful PortOne (v2) payment webhook.
--
-- Why this RPC is SEPARATE from process_paypal_capture (20260424000002):
--   Functionally the two RPCs do the same thing — insert receipts, star_candy
--   history + balance, and bonus history + balance in one transaction — but
--   historically the PortOne webhook and the PayPal capture-order route have
--   diverged on three load-bearing details, and collapsing them into one RPC
--   would mean either lying in the audit trail or shoe-horning PortOne payloads
--   through PayPal's argument list:
--
--     1. transaction_id prefix. star_candy_history / star_candy_bonus_history
--        rows emitted by the PortOne webhook use transaction_id = 'PURCHASE_' ||
--        receipt_hash (where receipt_hash = the PortOne paymentId, e.g.
--        "PAY_XXXX"). PayPal captures use 'PAYPAL_' || order_id. Years of
--        analytics, refund tooling, and the support team's CS queries
--        ("grep PURCHASE_ in star_candy_history" vs. "grep PAYPAL_") rely on
--        that prefix as a provider tag. Changing either one retroactively would
--        break historical lookups and BI dashboards. Keeping two RPCs keeps the
--        wire format stable.
--
--     2. Receipt payload shape. PayPal captures embed order_id + capture_id +
--        amount/currency with PayPal-specific field names; PortOne v2 webhooks
--        embed paymentId + totalAmount + method (card/trans/vbank/...) + the
--        full PortOne SDK response object. Forcing a single RPC signature would
--        require a lossy normalization step that loses provider-specific debug
--        fields the ops team depends on when a capture goes wrong.
--
--     3. Trigger model. capture-order is a synchronous user-facing POST from
--        the browser (400/500 on failure is user-visible); the PortOne webhook
--        is an async server-to-server call where 200 means "don't retry" and
--        500 means "retry the whole webhook". The two call sites want different
--        idempotency semantics surfaced on NULL (see Return contract below),
--        even though the database-level invariants are identical.
--
--   Why the RPC still mirrors PayPal's structure exactly:
--     Even though PortOne keeps its own function, the internal shape (pre-check
--     on history tables → receipts INSERT with unique_violation trap → star
--     candy history + balance → conditional bonus) is deliberately identical
--     to process_paypal_capture so that (a) a single reviewer can diff the two
--     and verify the same invariants hold, and (b) a future unification (if we
--     ever retire one provider) is a mechanical merge rather than a rewrite.
--
-- Return contract:
--   - jsonb { receipt_id: bigint, granted_star_candy: int, granted_bonus: int }
--     on success.
--   - NULL when the row already exists (idempotent retry of an already-credited
--     payment). The webhook caller maps NULL → 200 OK so PortOne stops
--     retrying. Any other error is re-raised to the caller and rolls back the
--     transaction in full; the caller maps that to 500, which PortOne will
--     retry (which is the correct behaviour for transient failures).
--
-- Idempotency layers (defense in depth — identical to PayPal RPC):
--   1. Pre-check on star_candy_history / star_candy_bonus_history by
--      transaction_id BEFORE any write. Guards against legacy desync states
--      where history rows already exist but the matching receipt does not
--      (e.g. admin-deleted receipt, partially-applied legacy data, manual
--      backfill). Without this check, the receipts INSERT would succeed, then
--      the history INSERT would raise 23505 against ux_star_candy_history_tx
--      / uq_sc_bonus_user_tx, rolling back the entire transaction every retry
--      — permanent stuck state, and PortOne would keep retrying the webhook
--      indefinitely.
--   2. unique_violation trap on the receipts insert (canonical "already
--      processed" path via receipts_web_completed_unique partial index —
--      shared with the PayPal path; see migration 20260424000001).
--   Both layers return NULL so the webhook treats the call as a no-op (200 OK).
--
-- SECURITY: This function is SECURITY DEFINER and writes directly to balance
-- columns (user_profiles.star_candy / star_candy_bonus) and history tables. It
-- intentionally trusts the caller-supplied amount/product arguments — there is
-- NO authorization check inside the function. The PortOne webhook route is
-- expected to (1) verify the PortOne webhook signature (HMAC-SHA256 against
-- PORTONE_WEBHOOK_SECRET), (2) re-verify the payment via PortOne v2 server
-- SDK (paymentClient.getPayment) so the amount/status cannot be spoofed from
-- the webhook body, and (3) parse customData from the SDK response (not the
-- webhook body) before invoking this RPC.
--
-- For that contract to hold, this function MUST NOT be callable by a normal
-- logged-in user. EXECUTE is granted ONLY to service_role; the webhook obtains
-- a service-role client (createServiceRoleSupabaseClient) and invokes this RPC
-- server-side after all validations pass. Granting EXECUTE to `authenticated`
-- would let any logged-in user POST directly to
-- /rest/v1/rpc/process_portone_capture with arbitrary star_candy / bonus
-- values and credit themselves — bypassing every check the webhook performs.
-- This rule was explicitly called out by the PR #3 5th-round security review
-- (privilege escalation class) when the PayPal RPC was first authored; the
-- same reasoning applies verbatim here.
CREATE OR REPLACE FUNCTION public.process_portone_capture(
  p_user_id uuid,
  p_payment_id text,
  p_product_id text,
  p_star_candy int,
  p_bonus_amount int,
  p_total_amount numeric,
  p_currency text,
  p_status text,
  p_method text,
  p_environment text,
  p_receipt_data jsonb,
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
  -- PortOne history uses 'PURCHASE_' prefix — see file header note (1) for why
  -- this must not be unified with the PayPal 'PAYPAL_' prefix. receipt_hash
  -- here is the PortOne paymentId (e.g. "PAY_XXXXX"), matching the prior
  -- webhook's transactionId format verbatim.
  v_transaction_id text := 'PURCHASE_' || p_payment_id;
BEGIN
  -- Caller must be service_role; this function trusts caller-supplied amounts
  -- because the webhook route validates them server-side first (signature
  -- check, PortOne SDK re-verification against PortOne's servers, amount /
  -- product derived from verified payment response, not from the webhook
  -- body). See the GRANT block at the bottom of this file.

  -- 0. Pre-check: if star_candy_history or star_candy_bonus_history already
  --    has this transaction_id, the user has already been credited (possibly
  --    by a legacy code path or manual operation) and the matching receipt
  --    row may have been deleted out from under us. Returning NULL here makes
  --    the call idempotent. Without this check, the receipts INSERT would
  --    succeed and then the star_candy_history INSERT (or bonus INSERT) would
  --    hit ux_star_candy_history_tx / uq_sc_bonus_user_tx (23505), rolling
  --    back the receipt insert and leaving every retry permanently stuck —
  --    which for PortOne means the webhook retries forever.
  IF EXISTS (
    SELECT 1 FROM public.star_candy_history
    WHERE transaction_id = v_transaction_id
  ) OR EXISTS (
    SELECT 1 FROM public.star_candy_bonus_history
    WHERE user_id = p_user_id
      AND transaction_id = v_transaction_id
  ) THEN
    RAISE LOG 'process_portone_capture: idempotent skip via history pre-check, transaction_id=%, user_id=%, payment_id=%',
      v_transaction_id, p_user_id, p_payment_id;
    RETURN NULL;
  END IF;

  -- 1. Insert the receipt. The partial unique index
  -- (receipts_web_completed_unique) raises 23505 if a concurrent or prior
  -- webhook already credited this paymentId; we trap that case and return
  -- NULL to signal idempotent no-op to the caller. Note: the same index also
  -- guards PayPal captures because both providers insert with platform='web'
  -- and status='completed'. In practice receipt_hash namespaces (PortOne's
  -- PAY_xxx vs. PayPal's order UUIDs) prevent cross-provider collisions.
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
      p_receipt_data::text,
      p_payment_id,
      'completed',
      'web',
      p_environment,
      p_verification_data
    )
    RETURNING id INTO v_receipt_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE LOG 'process_portone_capture: idempotent skip via receipts unique index, payment_id=%, user_id=%',
        p_payment_id, p_user_id;
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

  -- Silence unused-parameter warnings for fields we keep purely for audit /
  -- future use. total_amount / currency / status / method are captured in
  -- p_receipt_data already, but we accept them as explicit parameters too
  -- because the webhook route passes them for symmetry with PayPal and to
  -- keep a strongly-typed contract in application code. Reference them here
  -- so PL/pgSQL does not complain and so a future reader sees they are
  -- intentionally unused inside the function body.
  PERFORM p_total_amount, p_currency, p_status, p_method;

  RETURN jsonb_build_object(
    'receipt_id', v_receipt_id,
    'granted_star_candy', p_star_candy,
    'granted_bonus', p_bonus_amount
  );
END;
$$;

COMMENT ON FUNCTION public.process_portone_capture(
  uuid, text, text, int, int, numeric, text, text, text, text, jsonb, jsonb, timestamptz
) IS
  'Atomically records a completed PortOne v2 web payment webhook: inserts the '
  'receipt, records star_candy / bonus history, and increments user balances '
  'in a single transaction. Mirrors process_paypal_capture structurally but '
  'kept as a separate function to preserve the PURCHASE_<paymentId> '
  'transaction_id prefix, PortOne-specific receipt payload shape, and webhook '
  'retry semantics (200 OK / 500 retry). Idempotency is enforced by two '
  'layers: (1) a pre-check against star_candy_history / '
  'star_candy_bonus_history by transaction_id (guards against legacy desync '
  'where history exists without receipt), and (2) the '
  'receipts_web_completed_unique partial index on the receipts INSERT. '
  'Returns NULL in either idempotent path; any other internal failure rolls '
  'back the entire transaction so PortOne can safely retry the webhook. '
  'Both idempotent paths emit a RAISE LOG line distinguishing which layer '
  'short-circuited (search Postgres logs for "process_portone_capture: idempotent").';

-- Limit who can invoke this function. SECURITY DEFINER + caller-trusted
-- amount/product args mean we cannot allow direct invocation by normal
-- logged-in users. The PortOne webhook route uses a service-role client to
-- call this RPC after performing signature verification + SDK re-verification
-- + customData validation; that is the only supported caller path.
--
-- This GRANT/REVOKE pattern is the direct learning from the PR #3 5th-round
-- security review: leaving EXECUTE on `authenticated` for a SECURITY DEFINER
-- function with no internal authorization = privilege escalation
-- (CVSS-critical). Same reasoning applied to the PayPal RPC in
-- 20260424000002; must not drift from it here.
REVOKE ALL ON FUNCTION public.process_portone_capture(
  uuid, text, text, int, int, numeric, text, text, text, text, jsonb, jsonb, timestamptz
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_portone_capture(
  uuid, text, text, int, int, numeric, text, text, text, text, jsonb, jsonb, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_portone_capture(
  uuid, text, text, int, int, numeric, text, text, text, text, jsonb, jsonb, timestamptz
) TO service_role;
