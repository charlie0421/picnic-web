import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReceiptResponse } from '@/app/api/payment/portone/verify/verify-helpers';

const USER = '00000000-0000-0000-0000-000000000001';
const PRIVATE = 'Q7pPriv opaque-secret-and-private@example.invalid';
function records() {
  return vi.mocked(console.error).mock.calls.flat().filter((item) => item && typeof item === 'object') as Array<{ message: string; context?: Record<string, unknown> }>;
}
describe('payment callers preserve approved diagnostic fields', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());
  it('malformed stored receipt keeps the user UUID but hides parser text', async () => {
    const db = { from: (table: string) => ({ select: () => ({ eq: () => ({ single: async () => ({ data: table === 'receipts' ? { receipt_data: PRIVATE } : { star_candy: 3, star_candy_bonus: 2 } }) }) }) }) };
    const response = await buildReceiptResponse(db, 1, null, USER);
    expect(response.balance.total).toBe(5);
    expect(records().find((r) => r.message === 'payment.portone.verify.receipt.parse_failed')?.context).toMatchObject({ userId: USER });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('Q7pPriv');
  });
});
