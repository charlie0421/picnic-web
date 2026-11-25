// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
const runtime = vi.hoisted(() => vi.fn());
vi.mock('@/lib/payment/portone-test/runtime', () => ({ createPortOneTestDependencies: runtime }));
import { POST } from '@/app/api/payment/portone/webhook/route';
import { createPortOneTestSettlement } from '@/lib/payment/portone-test/settlement';

const USER = '11111111-1111-4111-8111-111111111111';
const ORDER = '22222222-2222-4222-8222-222222222222';
const CONTEXT = '33333333-3333-4333-8333-333333333333';
const INBOX = '44444444-4444-4444-8444-444444444444';
const PAYMENT = `web_${CONTEXT}`;
const SECRET = `whsec_${Buffer.alloc(32, 7).toString('base64')}`;
const HASH = 'a'.repeat(64);
const providerScope = { merchant_id: 'merchant-test', store_id: 'store-test', channel_id: 'channel-test', channel_type: 'TEST' };
const scope = { version: 1, orderId: ORDER, userId: USER, productId: 'STAR_100', paymentId: PAYMENT,
  storeId: providerScope.store_id, merchantId: providerScope.merchant_id, channelId: providerScope.channel_id,
  channelKey: 'channel-key-test', bindingVersion: '1', bindingHash: HASH,
  amount: 1700, currency: 'KRW', environment: 'TEST', pgProvider: 'INICIS_V2' };
let dir: string;
let context: Record<string, unknown>;
let deps: any;
const event = (type: 'Paid' | 'Cancelled', changed = {}) => ({ type: `Transaction.${type}`, timestamp: '2026-11-25T00:00:00Z',
  data: { paymentId: PAYMENT, storeId: scope.storeId, transactionId: 'tx-original',
    ...(type === 'Cancelled' ? { cancellationId: 'cancel-1' } : {}), ...changed } });
function delivery(body: unknown, id: string, changed: { timestamp?: number; corrupt?: boolean } = {}) {
  const raw = JSON.stringify(body); const timestamp = String(changed.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return new NextRequest('http://localhost:3100/api/payment/portone/webhook', { method: 'POST', body: raw,
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': timestamp,
      'webhook-signature': `v1,${changed.corrupt ? Buffer.alloc(32).toString('base64') : signature}` } });
}
beforeEach(async () => {
  vi.stubEnv('PORTONE_WEBHOOK_SECRET', SECRET);
  dir = await mkdtemp(join(tmpdir(), 'portone-ingress-')); await chmod(dir, 0o700);
  await writeFile(join(dir, 'scope.json'), JSON.stringify(scope), { mode: 0o600 });
  const settlement = createPortOneTestSettlement({ NODE_ENV: 'test', NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    PORTONE_TEST_SETTLEMENT_ENABLED: 'true', PORTONE_TEST_SETTLEMENT_DIR: dir })!;
  await settlement.pinTransaction(ORDER, PAYMENT, 'tx-original');
  context = { orderId: ORDER, provider: 'PORTONE', environment: 'TEST', currency: 'KRW', quantity: '1', amountMinor: '1700',
    productId: scope.productId, contextId: CONTEXT, paymentId: PAYMENT, verificationBindingPresent: true, quoteId: ORDER,
    quoteHash: HASH, settlementState: 'NOT_INTAKE', submissionIntentRecorded: true, reviewRequired: false, actorDeleted: false };
  deps = { settlement, config: { ...providerScope, channelKey: scope.channelKey, method: 'CARD',
      credentialRef: 'portone-test', bindingVersion: '1' },
    repository: { getWebhookOrder: vi.fn(async () => ({ actorUserId: USER, orderId: ORDER })),
      getChargeContext: vi.fn(async () => ({ kind: 'FOUND', context })),
      bindPaidObservation: vi.fn(async () => ({ kind: 'RECORDED', observationId: CONTEXT, replayed: false })),
      receivePurchase: vi.fn(async () => ({ kind: 'INTAKE_PENDING', orderId: ORDER, inboxId: INBOX, replayed: false })),
      claimCharge: vi.fn(), recordSubmissionIntent: vi.fn() },
    bindings: { getProviderBinding: vi.fn(async () => ({ ...context, billingCountry: 'KR', scope: providerScope,
      credentialRef: 'portone-test', bindingVersion: '1', bindingHash: HASH })) },
    transport: { getPayment: vi.fn(async () => ({ id: PAYMENT, transactionId: 'tx-original', version: 'V2', status: 'PAID',
      merchantId: scope.merchantId, storeId: scope.storeId,
      channel: { id: scope.channelId, type: 'TEST', key: scope.channelKey, pgProvider: 'INICIS_V2' },
      method: { type: 'PaymentMethodCard' }, amount: { total: 1700, paid: 1700, cancelled: 0 }, currency: 'KRW',
      paidAt: '2026-11-25T00:00:00Z', customData: JSON.stringify({ version: 'v2', order_id: ORDER }) })), confirmPayment: vi.fn() },
    entry: { authorizeProviderEntry: vi.fn() }, nowMs: Date.now };
  runtime.mockReset().mockReturnValue(deps);
});
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

describe('signed PortOne order ingress to the real private journal', () => {
  it.each(['cancel-before-intake', 'grant-before-cancel'])('publishes scoped hints in either native ordering: %s', async order => {
    if (order === 'cancel-before-intake') {
      expect((await POST(delivery(event('Cancelled'), 'delivery-cancel'))).status).toBe(200);
      expect(deps.transport.getPayment).not.toHaveBeenCalled();
    }
    expect((await POST(delivery(event('Paid'), 'delivery-paid'))).status).toBe(200);
    context.settlementState = 'GRANTED';
    if (order === 'grant-before-cancel') expect((await POST(delivery(event('Cancelled'), 'delivery-cancel'))).status).toBe(200);
    expect((await POST(delivery(event('Paid'), 'delivery-paid-replay'))).status).toBe(200);
    const files = await readdir(join(dir, 'notifications')); expect(files).toHaveLength(2);
    const signals = await Promise.all(files.map(async name => JSON.parse(await readFile(join(dir, 'notifications', name), 'utf8'))));
    expect(signals).toContainEqual({ version: 1, type: 'paid', orderId: ORDER, paymentId: PAYMENT, inboxId: INBOX });
    expect(signals).toContainEqual({ version: 1, type: 'cancelled', orderId: ORDER, paymentId: PAYMENT, storeId: scope.storeId,
      transactionId: 'tx-original', cancellationId: 'cancel-1', deliveryId: 'delivery-cancel',
      bodySha256: createHash('sha256').update(JSON.stringify(event('Cancelled'))).digest('hex') });
    expect(deps.transport.confirmPayment).not.toHaveBeenCalled(); expect(deps.repository.claimCharge).not.toHaveBeenCalled();
  });
  it('does not ACK a failed journal and retries after ACK loss without duplicate notifications', async () => {
    await chmod(dir, 0o750);
    expect((await POST(delivery(event('Cancelled'), 'delivery-cancel'))).status).toBe(503);
    await chmod(dir, 0o700);
    expect((await POST(delivery(event('Cancelled'), 'delivery-cancel'))).status).toBe(200);
    // Only the signed delivery time changes; it must not enter the immutable dedupe payload.
    expect((await POST(delivery(event('Cancelled'), 'delivery-cancel', { timestamp: Math.floor(Date.now() / 1000) - 1 }))).status).toBe(200);
    expect(await readdir(join(dir, 'notifications'))).toHaveLength(1);
    expect((await POST(delivery(event('Cancelled', { cancellationId: 'different-cancel' }), 'delivery-cancel'))).status).toBe(503);
    expect(await readdir(join(dir, 'notifications'))).toHaveLength(1);
  });
  it('refuses corrupt, expired and incomplete signed cancellations before native access', async () => {
    expect((await POST(delivery(event('Cancelled'), 'corrupt', { corrupt: true }))).status).toBe(401);
    expect((await POST(delivery(event('Cancelled'), 'expired', { timestamp: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await POST(delivery(event('Cancelled', { cancellationId: undefined }), 'incomplete'))).status).toBe(400);
    expect(deps.repository.getWebhookOrder).not.toHaveBeenCalled();
    expect(await readdir(dir)).toEqual(['scope.json', 'transaction.json']);
  });
  it('ignores legacy and foreign traffic and never publishes an unpinned transaction', async () => {
    expect((await POST(delivery(event('Cancelled', { paymentId: 'pay_1' }), 'legacy'))).status).toBe(200);
    expect((await POST(delivery(event('Cancelled', { storeId: 'other-store' }), 'foreign'))).status).toBe(200);
    expect(deps.repository.getWebhookOrder).not.toHaveBeenCalled();
    expect((await POST(delivery(event('Cancelled', { transactionId: 'wrong-tx' }), 'wrong-tx'))).status).toBe(503);
    expect(await readdir(dir)).toEqual(['scope.json', 'transaction.json']);
  });
});
