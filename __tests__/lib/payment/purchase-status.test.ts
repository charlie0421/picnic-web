import { describe, expect, it } from 'vitest';
import { mapPurchaseStatus } from '@/lib/payment/purchase-status';

const INBOX = '77777777-7777-4777-8777-777777777777';
const receipt = {
  id: '9223372036854775807', user_id: 'owner', platform: 'paypal', environment: 'live',
  status: 'pending_verification', verification_data: { provider: 'PAYPAL', inbox_id: INBOX },
};
const outcome = {
  status: 'PENDING', last_error_code: null, last_error_retryable: null,
  attempt_count: 0, next_retry_at: '2026-11-12T01:02:03Z', lease_active: false,
};
const result = {
  contract_version: 'wallet.v1', operation_id: '88888888-8888-4888-8888-888888888888',
  replayed: true, base_star_amount: '9007199254740993', base_bonus_amount: '25',
  promotion: { state: 'GRANTED', promo_bonus_amount: '25', resolution_id: INBOX,
    campaign_version_id: INBOX, domain_code: null },
  wallet: { star: '1', bonus: '2', cotton: '3', snapshot_at: '2026-11-12T00:00:00Z' },
};

describe('purchase status evidence mapping', () => {
  it.each([
    ['PENDING', 0, false, false, 'QUEUED'],
    ['PENDING', 2, true, false, 'RETRY_WAIT'],
    ['PROCESSING', 1, false, true, 'PROCESSING'],
    ['PROCESSING', 1, false, false, 'RETRY_WAIT'],
    ['DEAD', 5, false, false, 'REVIEW_REQUIRED'],
  ])('%s attempt %s retry %s lease %s maps to %s without claiming a payment', (status, attempt, retry, lease, expected) => {
    const dto = mapPurchaseStatus(receipt, { ...outcome, status, attempt_count: attempt,
      last_error_retryable: retry, lease_active: lease }, null);
    expect(dto.settlementState).toBe(expected);
    expect(dto.paymentState).toBe('UNKNOWN');
    expect(dto.refundState).toBe('UNKNOWN');
    expect(dto.totals).toBeNull();
  });

  it('requires a current purchase result before declaring settlement completed', () => {
    const dto = mapPurchaseStatus({ ...receipt, status: 'completed' }, { ...outcome, status: 'SUCCEEDED' }, null);
    expect(dto.settlementState).toBe('REVIEW_REQUIRED');
    expect(dto.safeReasonCode).toBe('PURCHASE_RESULT_UNAVAILABLE');
    expect(dto.baseRewards).toBeNull();
  });

  it('preserves bigint strings and separates gross awards from unproved debt and refund data', () => {
    const dto = mapPurchaseStatus({ ...receipt, status: 'completed' }, { ...outcome, status: 'SUCCEEDED' }, result);
    expect(dto).toMatchObject({ contractVersion: 'web-payment.v1', receiptId: '9223372036854775807',
      provider: 'paypal', environment: 'LIVE', orderId: null,
      settlementState: 'COMPLETED', baseRewards: { star: '9007199254740993', bonus: '25' },
      promotionState: 'GRANTED', promotionGross: '25', totals: null, refundState: 'UNKNOWN',
      paymentState: 'UNKNOWN', updatedAt: null, nextRetryAt: null, safeReasonCode: null });
    expect(dto).not.toHaveProperty('wallet');
    expect(JSON.stringify(dto)).not.toContain(INBOX);
    expect(dto).not.toHaveProperty('operation_id');
  });

  it.each(['PENDING_TIME', 'ELIGIBLE', 'INELIGIBLE', 'REJECTED', 'CANCELLED_BY_REFUND'])('keeps %s distinct from granted promotion', (state) => {
    const dto = mapPurchaseStatus({ ...receipt, status: 'completed' }, { ...outcome, status: 'SUCCEEDED' },
      { ...result, promotion: { ...result.promotion, state, promo_bonus_amount: '0' } });
    expect(dto.settlementState).toBe('COMPLETED');
    expect(dto.promotionState).toBe(state);
    expect(dto.promotionGross).toBe(state === 'INELIGIBLE' ? '0' : null);
    expect(dto.refundState).toBe('UNKNOWN');
  });

  it.each([null, {}, { inbox_id: 'not-a-uuid' }])('does not treat a completed legacy receipt as proof of settlement or no refund', (verification_data) => {
    const dto = mapPurchaseStatus({ ...receipt, status: 'completed', verification_data }, null, null);
    expect(dto.settlementState).toBe('UNKNOWN');
    expect(dto.safeReasonCode).toBe('LEGACY_RECEIPT');
    expect(dto.totals).toBeNull();
  });

  it('does not expose raw error codes, receipt metadata, or unvalidated timestamps', () => {
    const dto = mapPurchaseStatus(receipt, { ...outcome, last_error_code: 'payer@example.test SECRET',
      next_retry_at: 'payer@example.test SECRET', last_error_retryable: true, attempt_count: 1 }, null);
    expect(dto.safeReasonCode).toBe('RETRY_SCHEDULED');
    expect(dto.nextRetryAt).toBeNull();
    expect(JSON.stringify(dto)).not.toMatch(/SECRET|payer@|verification_data|user_id/);
  });

  it.each([
    { ...result, base_star_amount: 9007199254740993 },
    { ...result, base_bonus_amount: '-1' },
    { ...result, base_star_amount: '9223372036854775808' },
    { ...result, contract_version: 'wallet.v2' },
  ])('rejects malformed result instead of fabricating a completed balance', (badResult) => {
    const dto = mapPurchaseStatus({ ...receipt, status: 'completed' }, { ...outcome, status: 'SUCCEEDED' }, badResult);
    expect(dto.settlementState).toBe('REVIEW_REQUIRED');
    expect(dto.baseRewards).toBeNull();
  });

  it.each([null, { ...outcome, status: 'UNRECOGNIZED' }])('preserves missing or unknown inbox state', (state) => {
    const dto = mapPurchaseStatus(receipt, state, null);
    expect(dto.settlementState).toBe('REVIEW_REQUIRED');
    expect(dto.safeReasonCode).toBe('PURCHASE_STATE_UNAVAILABLE');
  });
});
