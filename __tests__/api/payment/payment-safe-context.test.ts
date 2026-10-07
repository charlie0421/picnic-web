import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { processStarCandyBonus, updateStarCandyBalance } from '@/app/api/payment/portone/webhook/webhook-helpers';
import { buildReceiptResponse } from '@/app/api/payment/portone/verify/verify-helpers';

const USER = '00000000-0000-0000-0000-000000000001';
const PRIVATE = 'Q7pPriv opaque-secret-and-private@example.invalid';
const error = { code: '23505', message: PRIVATE, details: PRIVATE };
const params = { userId: USER, transactionId: 'pay_1', bonusAmount: 10, starCandy: 100, expiredAt: '2027-01-01T00:00:00Z' };
function records() {
  return vi.mocked(console.error).mock.calls.flat().filter((item) => item && typeof item === 'object') as Array<{ message: string; context?: Record<string, unknown> }>;
}
describe('payment callers preserve approved diagnostic fields', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());
  it.each([
    ['bonus insert', 'payment.portone.webhook.bonus.insert_failed', 'insert', 'bonus'],
    ['bonus update', 'payment.portone.webhook.bonus.update_failed', 'rpc', 'bonus'],
    ['balance update', 'payment.portone.webhook.balance.failed', 'rpc', 'balance'],
    ['history insert', 'payment.portone.webhook.history.failed', 'insert', 'balance'],
  ])('%s retains user UUID and allowed database code', async (_label, code, failure, operation) => {
    const db = {
      from: () => ({ insert: async () => ({ error: failure === 'insert' ? error : null }) }),
      rpc: async () => ({ error: failure === 'rpc' ? error : null }),
    };
    if (operation === 'bonus') await processStarCandyBonus(db as never, params);
    else await updateStarCandyBalance(db as never, params);
    const record = records().find((r) => r.message === code);
    expect(record).toBeDefined();
    expect(record?.context).toMatchObject({ userId: USER, errorCode: '23505' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(PRIVATE);
  });
  it('malformed stored receipt keeps the user UUID but hides parser text', async () => {
    const db = { from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'receipts' ? { receipt_data: PRIVATE } : { star_candy: 3, star_candy_bonus: 2 } }) }) }) }) };
    const response = await buildReceiptResponse(db, 1, null, USER);
    expect(response.balance.total).toBe(5);
    expect(records().find((r) => r.message === 'payment.portone.verify.receipt.parse_failed')?.context).toMatchObject({ userId: USER });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Q7pPriv');
  });
});
