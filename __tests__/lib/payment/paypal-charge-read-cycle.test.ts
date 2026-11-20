// @vitest-environment node
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebPaymentChargeRepository } from '@/lib/payment/paypal-charge/repository';

// W2 pure classification, read collection and read-cycle cases (plan section W2; spec G3, G5, G8, G9, 4/10, 5/10).
// The two W2 modules are loaded inside each case through a lazy Vite glob with an exact relative path. The glob
// has no entry for a source file that does not exist, so this file loads before those modules exist and a missing
// module fails only the case that needs it. When the source file exists, the glob resolves it without an alias.
// A missing module or a missing export is not behavioral RED. The behavioral RED cases are in
// __tests__/api/payment/web-payment-adapters.test.ts.
// @ts-ignore -- import.meta.glob is replaced by Vite when the test file is transformed.
const W2_MODULES: Record<string, () => Promise<unknown>> = import.meta.glob(
  ['../../../lib/payment/paypal-charge/submission-classification.ts', '../../../lib/payment/paypal-charge/read-cycle.ts']);
async function load(name: 'submission-classification' | 'read-cycle'): Promise<any> {
  const loader = W2_MODULES[`../../../lib/payment/paypal-charge/${name}.ts`];
  if (!loader) throw new Error(`W2 module ${name} does not exist`);
  return loader();
}
// Call conventions (retry instructions): the trailing actorUserId is the authenticated Input.actorUserId.
const classify = async (response: unknown, context: unknown = CONTEXT_ROW) =>
  (await load('submission-classification')).classifySubmission(response, context, BINDING, SENDER, ACTOR);
const collect = async (response: unknown, context: unknown = CONTEXT_ROW) =>
  (await load('read-cycle')).collectReadFacts(response, context, BINDING, ACTOR);

// The actor differs from the adapter fixtures so that a hard-coded or context-derived user_id fails.
const ACTOR = '00000000-0000-4000-8000-000000000002';
const ORDER = '11111111-1111-4111-8111-111111111111';
const CONTEXT = '22222222-2222-4222-8222-222222222222';
const ATTEMPT = '44444444-4444-4444-8444-444444444444';
const STALE_ATTEMPT = '99999999-9999-4999-8999-999999999999';
const LEASE = '55555555-5555-4555-8555-555555555555';
const QUOTE = '77777777-7777-4777-8777-777777777777';
const CYCLE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CYCLE_TOKEN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const HASH = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const PROVIDER_ORDER = '5O190127TN364715T';
const CAPTURE = '3C679366HH908993F';
const REFERENCE = 'v2:11111111-1111-4111-8111-111111111111';
const NOW = Date.parse('2026-11-14T00:00:00.123Z');

// context.attemptId is a stale pre-claim value. The sender tuple is the lease returned with the intent ACK.
const CONTEXT_ROW = { chargeAuthority: false as const, orderId: ORDER, provider: 'PAYPAL' as const, environment: 'SANDBOX' as const,
  rowVersion: '3', paymentState: 'SUBMISSION_UNKNOWN' as const, settlementState: 'NOT_INTAKE' as const, actorDeleted: false,
  quoteId: QUOTE, quoteHash: HASH, productId: 'STAR100', amountMinor: '999', currency: 'USD' as const, quantity: '1' as const,
  quoteExpiresAt: '2026-11-14T00:15:00.123456+00:00', contextId: CONTEXT, verificationBindingPresent: true,
  providerOrderId: PROVIDER_ORDER, providerCaptureId: null as string | null, paymentId: null, attemptId: STALE_ATTEMPT,
  submissionIntentRecorded: true, reviewRequired: false };
const SENDER = { attemptId: ATTEMPT, leaseToken: LEASE, fencingVersion: '1', rowVersion: '3', providerRequestKey: ATTEMPT,
  submitNotAfter: '2026-11-14T00:01:00.123456+00:00', quoteHash: HASH };
const BINDING = { orderId: ORDER, contextId: CONTEXT, provider: 'PAYPAL' as const, environment: 'SANDBOX' as const,
  billingCountry: 'US', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
  bindingId: '66666666-6666-4666-8666-666666666666', bindingVersion: '1',
  bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  credentialRef: 'Q7pPrivCredential', expectedPayPalClientId: 'synthetic-client' };

function providerOrder(status = 'APPROVED'): any {
  return { id: PROVIDER_ORDER, intent: 'CAPTURE', status,
    payment_source: { paypal: { address: { country_code: 'US' }, email_address: 'Q7pPriv@example.invalid' } },
    purchase_units: [{ custom_id: REFERENCE, amount: { currency_code: 'USD', value: '9.99' }, payee: { merchant_id: 'MERCHANTA1' },
      payments: { captures: [] as Array<Record<string, unknown>> } }],
    links: [{ href: 'https://evil.example.invalid/Q7pPriv', method: 'POST', rel: 'capture' }] };
}
const capture = (id: string, status = 'COMPLETED', value = '9.99') =>
  ({ id, status, amount: { currency_code: 'USD', value }, custom_id: REFERENCE });
function capturedOrder(status = 'COMPLETED', orderStatus = 'COMPLETED'): any {
  const body = providerOrder(orderStatus); body.purchase_units[0].payments.captures = [capture(CAPTURE, status)]; return body;
}
const parsed = (body: unknown, status = 200) => ({ kind: 'RESPONSE', bodyStatus: 'PARSED', status, body });
const unreadable = (bodyStatus: string, status: number) => ({ kind: 'RESPONSE', bodyStatus, status, body: null });
const UNREADABLE = ['EMPTY', 'OVERSIZE', 'INVALID_UTF8', 'INVALID_JSON', 'STREAM_ERROR'] as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(item[key])}`).join(',')}}`;
}
// Test-owned evidence fixture. It does not call the product builder. One case below compares it with
// literal hashes that the adapter test recorded before W2.
function fact(source: 'SUBMIT_RESPONSE' | 'LOOKUP', kind: 'ORDER' | 'CAPTURE', externalId: string, status: string,
  amountMinor = '999', userId = ACTOR) {
  const evidence = { source, provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: kind, external_id: externalId,
    parent_external_id: kind === 'CAPTURE' ? PROVIDER_ORDER : null, order_id: ORDER, user_id: userId, quote_hash: HASH,
    order_reference: REFERENCE, scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: amountMinor,
    currency: 'USD', status, key: `${kind}:${externalId}:${status}` };
  return { ...evidence, payload_hash: createHash('sha256').update(canonicalJson(evidence), 'utf8').digest('hex') };
}
const captureFacts = (result: any) => result.facts.filter((item: any) => item.evidence.identity_kind === 'CAPTURE');
const orderFacts = (result: any) => result.facts.filter((item: any) => item.evidence.identity_kind === 'ORDER');
const NO_FACT_DEFAULTS = { unparseable_capture_count: 0, capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('W2 classifySubmission builds the exact P1 payload', () => {
  it('builds the complete CLEAN payload from the intent sender, the binding and the trailing actor', async () => {
    expect(await classify(parsed(capturedOrder(), 201))).toEqual({
      contract_version: 'web-payment-submission-classification.v2', context_id: CONTEXT, quote_hash: HASH,
      provider_request_key: ATTEMPT, provider_order_id: PROVIDER_ORDER, environment: 'SANDBOX', kind: 'CLEAN',
      category: 'RESPONSE_COMPLETE_CAPTURE_COMPLETED', http_status: 201, body_status: 'PARSED', post_capture_ids: [CAPTURE],
      unparseable_capture_count: 0, capture_count_exceeded: false,
      facts: [{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
        { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, 'COMPLETED'), bind: true }],
      assertions: [], receive_fact_index: 1 });
  });

  it('keeps user_id and payload_hash equal to the literals recorded for the adapter actor', async () => {
    const { classifySubmission } = await load('submission-classification');
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    body.purchase_units[0].payments.captures = [capture(CAPTURE, 'COMPLETED', '10.00')];
    const result = classifySubmission(parsed(body, 201), CONTEXT_ROW, BINDING, SENDER, '00000000-0000-4000-8000-000000000001');
    expect(captureFacts(result).map((item: any) => item.evidence)).toEqual([{
      source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX', identity_kind: 'CAPTURE', external_id: CAPTURE,
      parent_external_id: PROVIDER_ORDER, order_id: ORDER, user_id: '00000000-0000-4000-8000-000000000001', quote_hash: HASH,
      order_reference: REFERENCE, scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' }, amount_minor: '1000',
      currency: 'USD', status: 'COMPLETED', key: 'CAPTURE:3C679366HH908993F:COMPLETED',
      payload_hash: 'd8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6' }]);
    expect(fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, 'COMPLETED', '1000', '00000000-0000-4000-8000-000000000001').payload_hash)
      .toBe('d8b0272d62691d7e6d80e114c8af98a8e4a01e272c6a0a1f6198660938af0bd6');
  });

  it('classifies a complete PENDING capture as CLEAN with no receive index', async () => {
    const result = await classify(parsed(capturedOrder('PENDING'), 201));
    expect(result).toMatchObject({ kind: 'CLEAN', category: 'RESPONSE_COMPLETE_CAPTURE_PENDING', post_capture_ids: [CAPTURE],
      assertions: [], receive_fact_index: null });
    expect(result.facts).toEqual([{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, 'PENDING'), bind: true }]);
  });

  it.each([
    ['TRANSPORT_UNKNOWN', { kind: 'TRANSPORT_UNKNOWN' }, { category: 'TRANSPORT_UNKNOWN', http_status: null, body_status: null }],
    ['HTTP 500 with an empty body', unreadable('EMPTY', 500), { category: 'HTTP_5XX', http_status: 500, body_status: 'EMPTY' }],
    ['HTTP 503 with a parsed error', parsed({ message: 'Q7pPriv' }, 503), { category: 'HTTP_5XX', http_status: 503, body_status: 'PARSED' }],
    ['HTTP 408', parsed({ name: 'Q7pPriv' }, 408), { category: 'HTTP_408', http_status: 408, body_status: 'PARSED' }],
    ['HTTP 429', parsed({ name: 'Q7pPriv' }, 429), { category: 'HTTP_429', http_status: 429, body_status: 'PARSED' }],
    ...UNREADABLE.map(status => [`HTTP 201 with body status ${status}`, unreadable(status, 201),
      { category: 'BODY_UNREADABLE', http_status: 201, body_status: status }] as const),
  ])('classifies %s as NO_RESPONSE with no fact, no assertion and unknown capture IDs', async (_label, response, expected) => {
    const result = await classify(response);
    expect(result).toMatchObject({ kind: 'NO_RESPONSE', ...expected, post_capture_ids: null, ...NO_FACT_DEFAULTS });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });

  it('classifies a partial uncontradicted POST as NO_RESPONSE and keeps the reported capture ID', async () => {
    const body = capturedOrder(); delete body.intent;
    expect(await classify(parsed(body, 201))).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED',
      http_status: 201, body_status: 'PARSED', post_capture_ids: [CAPTURE], ...NO_FACT_DEFAULTS });
  });

  it('classifies a complete POST with no capture as NO_RESPONSE with the one actual ORDER fact', async () => {
    const result = await classify(parsed(providerOrder('COMPLETED'), 201));
    expect(result).toMatchObject({ kind: 'NO_RESPONSE', category: 'NO_CAPTURE_UNCONTRADICTED', http_status: 201,
      body_status: 'PARSED', post_capture_ids: [], assertions: [], receive_fact_index: null });
    expect(result.facts).toEqual([{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false }]);
  });

  it.each(['DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FUTURE_CAPTURE'])
    ('classifies an actual %s capture as RESPONSE_ADVERSE_FACT and keeps the provider status', async status => {
      const result = await classify(parsed(capturedOrder(status), 201));
      expect(result).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT', post_capture_ids: [CAPTURE], receive_fact_index: null });
      expect(captureFacts(result).map((item: any) => item.evidence)).toEqual([fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, status)]);
    });

  it.each([
    ['no capture', () => providerOrder('VOIDED'), [] as string[]],
    ['one COMPLETED capture', () => capturedOrder('COMPLETED', 'VOIDED'), [CAPTURE]],
  ])('puts a known VOIDED ORDER with %s before every CLEAN or NO_CAPTURE judgment', async (_label, build, ids) => {
    const result = await classify(parsed(build(), 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ORDER_VOIDED', post_capture_ids: ids, receive_fact_index: null });
    expect(orderFacts(result)).toEqual([{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'VOIDED'), bind: false }]);
  });

  it('reports a partial VOIDED ORDER without a merchant as the exact assertion and invents no fact', async () => {
    const body = providerOrder('VOIDED'); delete body.purchase_units[0].payee;
    const result = await classify(parsed(body, 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_ORDER_VOIDED', post_capture_ids: [], facts: [], receive_fact_index: null });
    expect(result.assertions).toContainEqual({ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } });
  });

  it.each([400, 401, 403, 404, 422])('classifies HTTP %s as HTTP_REJECTED_4XX', async status => {
    const result = await classify(parsed({ name: 'Q7pPriv' }, status));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'HTTP_REJECTED_4XX', http_status: status, body_status: 'PARSED', ...NO_FACT_DEFAULTS });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });

  it.each([101, 302])('classifies HTTP %s as HTTP_UNEXPECTED_STATUS', async status => {
    expect(await classify(unreadable('EMPTY', status))).toMatchObject({ kind: 'ADVERSE', category: 'HTTP_UNEXPECTED_STATUS',
      http_status: status, body_status: 'EMPTY', ...NO_FACT_DEFAULTS });
  });

  it('closes raw 33 captures as WORK_BOUND_EXCEEDED with no fact and unknown IDs', async () => {
    const body = capturedOrder();
    body.purchase_units[0].payments.captures = Array.from({ length: 33 }, (_unused, index) => capture(`CAP${index}`));
    expect(await classify(parsed(body, 201))).toMatchObject({ kind: 'ADVERSE', category: 'WORK_BOUND_EXCEEDED',
      capture_count_exceeded: true, post_capture_ids: null, facts: [], receive_fact_index: null });
  });

  it('keeps all 32 actual capture IDs and facts at the raw bound', async () => {
    const ids = ['CAP0', 'CAP1', 'CAP2', 'CAP3', 'CAP4', 'CAP5', 'CAP6', 'CAP7', 'CAP8', 'CAP9', 'CAP10', 'CAP11', 'CAP12', 'CAP13',
      'CAP14', 'CAP15', 'CAP16', 'CAP17', 'CAP18', 'CAP19', 'CAP20', 'CAP21', 'CAP22', 'CAP23', 'CAP24', 'CAP25', 'CAP26', 'CAP27',
      'CAP28', 'CAP29', 'CAP30', 'CAP31'];
    const body = capturedOrder(); body.purchase_units[0].payments.captures = ids.map(id => capture(id));
    const result = await classify(parsed(body, 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', capture_count_exceeded: false, post_capture_ids: ids, receive_fact_index: null });
    expect(captureFacts(result).map((item: any) => item.evidence.external_id)).toEqual(ids);
    expect(result.facts.length).toBeLessThanOrEqual(33);
    expect(captureFacts(result).filter((item: any) => item.bind)).toHaveLength(1);
  });

  it.each([
    ['COUNTRY', (body: any) => { body.payment_source.paypal.address.country_code = 'KR'; }, 'COUNTRY_MISMATCH'],
    ['INTENT', (body: any) => { body.intent = 'AUTHORIZE'; }, 'INTENT_MISMATCH'],
  ])('reports the W %s judgment as a caller assertion and not as a provider fact', async (_label, mutate, code) => {
    const body = capturedOrder(); mutate(body);
    const result = await classify(parsed(body, 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', post_capture_ids: [CAPTURE], receive_fact_index: null });
    expect(result.assertions).toContainEqual({ code, detail: {} });
    expect(JSON.stringify(result.facts)).not.toMatch(/COUNTRY_MISMATCH|INTENT_MISMATCH|"KR"/);
  });

  it('classifies an undeterminable purchase_units shape as an unrepresentable contradiction with unknown IDs', async () => {
    const body = capturedOrder(); body.purchase_units = [];
    const result = await classify(parsed(body, 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', post_capture_ids: null,
      facts: [], receive_fact_index: null });
    expect(result.assertions.length).toBeGreaterThanOrEqual(1);
  });

  // Same input as the legacy adapter case 'returns local REVIEW without intake when the AUTHORIZE CAPTURE record
  // returns RECORDED'. The two actual facts keep their order. W never requests CLEAN for it.
  it('adds the exact SAME_ID_RACE_UNCONFIRMED assertion for a complete AUTHORIZE response with the matching capture', async () => {
    const body = capturedOrder(); body.intent = 'AUTHORIZE';
    const result = await classify(parsed(body, 201));
    expect(result).toMatchObject({ kind: 'ADVERSE', post_capture_ids: [CAPTURE], receive_fact_index: null });
    expect(result.facts).toEqual([{ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
      { evidence: fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, 'COMPLETED'), bind: false }]);
    expect(result.assertions).toContainEqual({ code: 'SAME_ID_RACE_UNCONFIRMED', detail: {} });
  });

  it('sends exactly the 16 classification keys', async () => {
    expect(Object.keys(await classify({ kind: 'TRANSPORT_UNKNOWN' })).sort()).toEqual(['assertions', 'body_status',
      'capture_count_exceeded', 'category', 'context_id', 'contract_version', 'environment', 'facts', 'http_status', 'kind',
      'post_capture_ids', 'provider_order_id', 'provider_request_key', 'quote_hash', 'receive_fact_index', 'unparseable_capture_count']);
  });
});

// Independent review S-H1 (spec 4/10 sections 4 and 5). The parent ORDER matches this order. Only the intent key
// is absent, so the POST response is partial. A recognised adverse capture status in that response is an actual
// provider fact, and a missing field does not erase it. Both W2 modules exist, so a failure in this block is
// behavioral RED and not a loading error.
describe('W2 correction S-H1: a partial POST keeps a known adverse CAPTURE', () => {
  const partial = (status: string) => { const body = capturedOrder(status); delete body.intent; return body; };
  const withoutCaptureId = (status: string) => { const body = partial(status); delete body.purchase_units[0].payments.captures[0].id; return body; };
  const ACTUAL_ORDER = () => ({ evidence: fact('SUBMIT_RESPONSE', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false });

  it.each(['DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
    ('classifies an actual %s capture with the intent key absent as ADVERSE and keeps the actual CAPTURE fields', async status => {
      const result = await classify(parsed(partial(status), 201));
      expect(result).toMatchObject({ contract_version: 'web-payment-submission-classification.v2',
        context_id: '22222222-2222-4222-8222-222222222222', provider_request_key: '44444444-4444-4444-8444-444444444444',
        provider_order_id: '5O190127TN364715T', environment: 'SANDBOX', kind: 'ADVERSE', category: 'RESPONSE_ADVERSE_FACT',
        http_status: 201, body_status: 'PARSED', post_capture_ids: ['3C679366HH908993F'], unparseable_capture_count: 0,
        capture_count_exceeded: false, assertions: [], receive_fact_index: null });
      // Every field is the value that the response reported. payload_hash is the test-owned SHA-256 of the 15
      // literal fields. The fixture does not call the product builder.
      const actualCapture = { bind: false, evidence: { source: 'SUBMIT_RESPONSE', provider: 'PAYPAL', environment: 'SANDBOX',
        identity_kind: 'CAPTURE', external_id: '3C679366HH908993F', parent_external_id: '5O190127TN364715T',
        order_id: '11111111-1111-4111-8111-111111111111', user_id: '00000000-0000-4000-8000-000000000002',
        quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        order_reference: 'v2:11111111-1111-4111-8111-111111111111', scope: { account_id: 'ACCOUNTA1', merchant_id: 'MERCHANTA1' },
        amount_minor: '999', currency: 'USD', status, key: `CAPTURE:3C679366HH908993F:${status}`,
        payload_hash: fact('SUBMIT_RESPONSE', 'CAPTURE', CAPTURE, status).payload_hash } };
      expect(captureFacts(result)).toEqual([actualCapture]);
      // The actual ORDER fact may come before the capture (ORDER first, then CAPTURE). No other fact is allowed.
      expect([[actualCapture], [ACTUAL_ORDER(), actualCapture]]).toContainEqual(result.facts);
    });

  // No external_id exists, so no CAPTURE evidence can be built. M2 accepts this exact assertion for the judgment.
  it.each(['DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
    ('states an actual %s capture that has no ID as the exact UNRECORDABLE_PROVIDER_FACT assertion', async status => {
      const result = await classify(parsed(withoutCaptureId(status), 201));
      expect(result).toMatchObject({ kind: 'ADVERSE', category: 'RESPONSE_CONTRADICTION_UNREPRESENTABLE', http_status: 201,
        body_status: 'PARSED', post_capture_ids: [], unparseable_capture_count: 0, capture_count_exceeded: false,
        receive_fact_index: null });
      expect(result.assertions).toEqual([{ code: 'UNRECORDABLE_PROVIDER_FACT',
        detail: { fact_kind: 'CAPTURE', reason: 'ADVERSE_STATUS_PARTIAL' } }]);
      expect(captureFacts(result)).toEqual([]);
      expect([[], [ACTUAL_ORDER()]]).toContainEqual(result.facts);
    });

  // Controls. These pass before and after the correction.
  it.each([
    ['PENDING with its ID', () => partial('PENDING'), ['3C679366HH908993F']],
    ['COMPLETED with its ID', () => partial('COMPLETED'), ['3C679366HH908993F']],
    ['PENDING with no ID', () => withoutCaptureId('PENDING'), [] as string[]],
    ['COMPLETED with no ID', () => withoutCaptureId('COMPLETED'), [] as string[]],
  ])('control: an otherwise identical partial capture %s stays the eligible NO_RESPONSE', async (_label, build, ids) => {
    expect(await classify(parsed(build(), 201))).toMatchObject({ kind: 'NO_RESPONSE', category: 'PARTIAL_UNCONTRADICTED',
      http_status: 201, body_status: 'PARSED', post_capture_ids: ids, ...NO_FACT_DEFAULTS });
  });

  it('control: builds no fact from expected values when the partial response reports no merchant', async () => {
    const body = partial('DECLINED'); delete body.purchase_units[0].payee;
    const result = await classify(parsed(body, 201));
    expect(result.facts).toEqual([]);
    expect(result.receive_fact_index).toBeNull();
    expect(JSON.stringify(result)).not.toContain('MERCHANTA1');
  });
});

describe('W2 collectReadFacts builds the exact P2 completion', () => {
  it('builds the complete CLEAN completion for one COMPLETED capture', async () => {
    expect(await collect(parsed(capturedOrder()))).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2', kind: 'CLEAN',
      category: 'READ_CAPTURE_COMPLETED', get_http_status: 200, get_body_status: 'PARSED', observed_capture_ids: [CAPTURE],
      unparseable_capture_count: 0, capture_count_exceeded: false,
      facts: [{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'COMPLETED'), bind: false },
        { evidence: fact('LOOKUP', 'CAPTURE', CAPTURE, 'COMPLETED'), bind: true }],
      assertions: [], receive_fact_index: 1 });
  });

  it('classifies one PENDING capture as READ_CAPTURE_PENDING with no receive index', async () => {
    const result = await collect(parsed(capturedOrder('PENDING')));
    expect(result).toMatchObject({ kind: 'CLEAN', category: 'READ_CAPTURE_PENDING', observed_capture_ids: [CAPTURE],
      assertions: [], receive_fact_index: null });
    expect(captureFacts(result)).toEqual([{ evidence: fact('LOOKUP', 'CAPTURE', CAPTURE, 'PENDING'), bind: true }]);
  });

  // G9 N-M1: omitted payments or captures and captures=[] give O=[]. Only an undeterminable shape gives null.
  // The DB owns the comparison with E. The linked capture ID in the context does not change what W observed.
  it.each([
    ['captures=[]', (_body: any) => undefined, [] as string[] | null],
    ['payments omitted', (body: any) => { delete body.purchase_units[0].payments; }, []],
    ['captures omitted', (body: any) => { body.purchase_units[0].payments = {}; }, []],
    ['shape error', (body: any) => { body.purchase_units = []; }, null],
  ])('reports observed IDs for %s the same for E empty and E={X}', async (_label, mutate, observed) => {
    for (const providerCaptureId of [null, 'X']) {
      const body = providerOrder(); mutate(body);
      const result = await collect(parsed(body), { ...CONTEXT_ROW, providerCaptureId });
      expect(result.observed_capture_ids).toEqual(observed);
      expect(captureFacts(result)).toEqual([]);
    }
  });

  it('classifies a known ORDER with no capture and no linked capture as READ_ORDER_NO_CAPTURE', async () => {
    const result = await collect(parsed(providerOrder('APPROVED')));
    expect(result).toMatchObject({ kind: 'CLEAN', category: 'READ_ORDER_NO_CAPTURE', get_http_status: 200, get_body_status: 'PARSED',
      observed_capture_ids: [], assertions: [], receive_fact_index: null });
    expect(result.facts).toEqual([{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'APPROVED'), bind: false }]);
  });

  it('classifies a shape error as READ_PARTIAL_INDETERMINATE with the UNREPRESENTABLE_CONTRADICTION assertion', async () => {
    const body = providerOrder(); body.purchase_units = [];
    const shapeError = await collect(parsed(body));
    expect(shapeError.category).toBe('READ_PARTIAL_INDETERMINATE');
    expect(shapeError.assertions).toContainEqual({ code: 'UNREPRESENTABLE_CONTRADICTION', detail: {} });
    expect(shapeError).toMatchObject({ kind: 'ADVERSE', observed_capture_ids: null, receive_fact_index: null });
  });

  it.each([
    ['no capture', () => providerOrder('VOIDED'), [] as string[]],
    ['one COMPLETED capture', () => capturedOrder('COMPLETED', 'VOIDED'), [CAPTURE]],
  ])('puts a known VOIDED ORDER with %s before every CLEAN judgment', async (_label, build, ids) => {
    const result = await collect(parsed(build()));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_ORDER_VOIDED', observed_capture_ids: ids, receive_fact_index: null });
    expect(orderFacts(result)).toEqual([{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'VOIDED'), bind: false }]);
  });

  it('reports a partial VOIDED ORDER without a merchant as the exact assertion and invents no fact', async () => {
    const body = providerOrder('VOIDED'); delete body.purchase_units[0].payee;
    const result = await collect(parsed(body));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_ORDER_VOIDED', facts: [], receive_fact_index: null });
    expect(result.assertions).toContainEqual({ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } });
  });

  it.each(['DECLINED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FUTURE_CAPTURE'])
    ('classifies an actual %s capture as READ_ADVERSE_FACT and keeps the provider status', async status => {
      const result = await collect(parsed(capturedOrder(status)));
      expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT', observed_capture_ids: [CAPTURE], receive_fact_index: null });
      expect(captureFacts(result).map((item: any) => item.evidence)).toEqual([fact('LOOKUP', 'CAPTURE', CAPTURE, status)]);
    });

  it('keeps the literal FUTURE_ORDER and GET Y facts recorded before W2 for the adapter actor', async () => {
    const { collectReadFacts } = await load('read-cycle');
    const body = capturedOrder('COMPLETED', 'FUTURE_ORDER'); body.purchase_units[0].payments.captures[0].id = '9LOOKUPCAP';
    const result = collectReadFacts(parsed(body), CONTEXT_ROW, BINDING, '00000000-0000-4000-8000-000000000001');
    expect(result).toMatchObject({ kind: 'ADVERSE', observed_capture_ids: ['9LOOKUPCAP'], receive_fact_index: null });
    expect(result.facts.map((item: any) => [item.evidence.key, item.evidence.user_id, item.evidence.payload_hash])).toEqual([
      ['ORDER:5O190127TN364715T:FUTURE_ORDER', '00000000-0000-4000-8000-000000000001',
        '1d165fb6a9737ded31e6eaadf25908468acafb8f59ff5659f0f371f5bffdb555'],
      ['CAPTURE:9LOOKUPCAP:COMPLETED', '00000000-0000-4000-8000-000000000001',
        '5a81857f2f1b09134cf2a948cf5611b5df5448853861d8dbd940db4eb08e0ce8']]);
  });

  it('sends literal observed IDs X and Y when only the fact for X can be built', async () => {
    const body = capturedOrder(); body.purchase_units[0].payments.captures = [capture('X'), { id: 'Y' }];
    const completionSent = await collect(parsed(body));
    expect(completionSent.observed_capture_ids).toEqual(['X', 'Y']);
    expect(completionSent.facts.filter((f: any) => f.evidence.identity_kind === 'CAPTURE')
      .map((f: any) => f.evidence.external_id)).toEqual(['X']);
    expect(completionSent.unparseable_capture_count).toBe(0);
  });

  it('counts a capture ID with an invalid format and keeps the valid ID', async () => {
    const body = capturedOrder(); body.purchase_units[0].payments.captures = [capture('X'), { id: '../bad' }];
    const result = await collect(parsed(body));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_CAPTURE_ID_UNPARSEABLE', observed_capture_ids: ['X'],
      unparseable_capture_count: 1, capture_count_exceeded: false, receive_fact_index: null });
    expect(JSON.stringify(result)).not.toContain('../bad');
  });

  it('keeps interleaved competing capture statuses in response order without binding', async () => {
    const body = capturedOrder();
    body.purchase_units[0].payments.captures = [capture('X', 'PENDING'), capture('Y'), capture('X')];
    const result = await collect(parsed(body));
    expect(result).toMatchObject({ kind: 'ADVERSE', observed_capture_ids: ['X', 'Y'],
      receive_fact_index: null, assertions: [{ code: 'SHAPE_CONTRADICTION', detail: {} }] });
    expect(result.facts).toEqual([
      { evidence: fact('LOOKUP', 'CAPTURE', 'X', 'PENDING'), bind: false },
      { evidence: fact('LOOKUP', 'CAPTURE', 'Y', 'COMPLETED'), bind: false },
      { evidence: fact('LOOKUP', 'CAPTURE', 'X', 'COMPLETED'), bind: false },
    ]);
  });

  it('closes raw 33 captures as READ_WORK_BOUND_EXCEEDED with no fact and unknown IDs', async () => {
    const body = capturedOrder();
    body.purchase_units[0].payments.captures = Array.from({ length: 33 }, (_unused, index) => capture(`CAP${index}`));
    expect(await collect(parsed(body))).toMatchObject({ kind: 'ADVERSE', category: 'READ_WORK_BOUND_EXCEEDED',
      capture_count_exceeded: true, observed_capture_ids: null, facts: [], receive_fact_index: null });
  });

  it.each([
    [404, 'EMPTY', 'READ_HTTP_REJECTED'], [400, 'PARSED', 'READ_HTTP_REJECTED'], [422, 'PARSED', 'READ_HTTP_REJECTED'],
    [101, 'EMPTY', 'READ_HTTP_UNEXPECTED'], [302, 'EMPTY', 'READ_HTTP_UNEXPECTED'],
  ])('classifies GET HTTP %s (%s) as ADVERSE %s', async (status, bodyStatus, category) => {
    const response = bodyStatus === 'PARSED' ? parsed({ name: 'Q7pPriv' }, status) : unreadable(bodyStatus, status);
    const result = await collect(response);
    expect(result).toMatchObject({ kind: 'ADVERSE', category, get_http_status: status, get_body_status: bodyStatus,
      observed_capture_ids: null, ...NO_FACT_DEFAULTS });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });

  it.each([
    ['TRANSPORT_UNKNOWN', { kind: 'TRANSPORT_UNKNOWN' }, { category: 'READ_TRANSPORT_UNKNOWN', get_http_status: null, get_body_status: null }],
    ['HTTP 500 with an empty body', unreadable('EMPTY', 500), { category: 'READ_HTTP_5XX', get_http_status: 500, get_body_status: 'EMPTY' }],
    ['HTTP 503 with a parsed error', parsed({ message: 'Q7pPriv' }, 503), { category: 'READ_HTTP_5XX', get_http_status: 503, get_body_status: 'PARSED' }],
    ['HTTP 408', parsed({ name: 'Q7pPriv' }, 408), { category: 'READ_HTTP_408', get_http_status: 408, get_body_status: 'PARSED' }],
    ['HTTP 429', parsed({ name: 'Q7pPriv' }, 429), { category: 'READ_HTTP_429', get_http_status: 429, get_body_status: 'PARSED' }],
    ['HTTP 401', parsed({ name: 'Q7pPriv' }, 401), { category: 'READ_HTTP_401', get_http_status: 401, get_body_status: 'PARSED' }],
    ['HTTP 403', parsed({ name: 'Q7pPriv' }, 403), { category: 'READ_HTTP_403', get_http_status: 403, get_body_status: 'PARSED' }],
    ...UNREADABLE.map(status => [`HTTP 200 with body status ${status}`, unreadable(status, 200),
      { category: 'READ_BODY_UNREADABLE', get_http_status: 200, get_body_status: status }] as const),
  ])('classifies %s as NO_DATA with no fact, no assertion and null observed IDs', async (_label, response, expected) => {
    const result = await collect(response);
    expect(result).toMatchObject({ kind: 'NO_DATA', ...expected, observed_capture_ids: null, ...NO_FACT_DEFAULTS });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });

  // G8 READ_NON_SUCCESS_FACT: a non-2xx PARSED response that carries actual provider facts. The facts are kept.
  // M2 requires kind ADVERSE, body PARSED, at least one fact, a non-2xx status and each CAPTURE fact ID in O.
  it.each([503, 409])('keeps the actual facts of a parsed HTTP %s response as READ_NON_SUCCESS_FACT', async status => {
    const result = await collect(parsed(capturedOrder(), status));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_NON_SUCCESS_FACT', get_http_status: status,
      get_body_status: 'PARSED', observed_capture_ids: [CAPTURE], unparseable_capture_count: 0, capture_count_exceeded: false,
      receive_fact_index: null });
    expect(result.facts.map((item: any) => item.evidence)).toEqual([fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'COMPLETED'),
      fact('LOOKUP', 'CAPTURE', CAPTURE, 'COMPLETED')]);
  });

  // G8 READ_CONTRADICTION_UNREPRESENTABLE: a 2xx PARSED response whose only contradiction is a W judgment.
  // M2 requires kind ADVERSE, a 2xx status, body PARSED and at least one caller assertion with detail {}.
  it.each([
    ['COUNTRY', (body: any) => { body.payment_source.paypal.address.country_code = 'KR'; }, 'COUNTRY_MISMATCH'],
    ['INTENT', (body: any) => { body.intent = 'AUTHORIZE'; }, 'INTENT_MISMATCH'],
  ])('reports a %s contradiction with no capture as READ_CONTRADICTION_UNREPRESENTABLE and a caller assertion', async (_label, mutate, code) => {
    const body = providerOrder('APPROVED'); mutate(body);
    const result = await collect(parsed(body));
    expect(result).toMatchObject({ kind: 'ADVERSE', category: 'READ_CONTRADICTION_UNREPRESENTABLE', get_http_status: 200,
      get_body_status: 'PARSED', observed_capture_ids: [], receive_fact_index: null });
    expect(result.assertions).toEqual([{ code, detail: {} }]);
    expect(captureFacts(result)).toEqual([]);
    expect(JSON.stringify(result.facts)).not.toMatch(/COUNTRY_MISMATCH|INTENT_MISMATCH|"KR"/);
  });

  // G8 READ_ADVERSE_UNSPECIFIED has a transport example. The W1 transport can return a non-2xx RESPONSE with a
  // PARSED body. When that body is a VOIDED ORDER with no usable merchant, no ORDER fact can be built and
  // READ_ORDER_VOIDED does not apply, because that category is for 2xx only. W keeps the judgment in this
  // conservative category with the exact UNRECORDABLE_PROVIDER_FACT assertion. The provider status is the one
  // that the response reported. The cases are in the S-H2 block below.

  it('sends exactly the 11 completion keys', async () => {
    expect(Object.keys(await collect({ kind: 'TRANSPORT_UNKNOWN' })).sort()).toEqual(['assertions', 'capture_count_exceeded',
      'category', 'contract_version', 'facts', 'get_body_status', 'get_http_status', 'kind', 'observed_capture_ids',
      'receive_fact_index', 'unparseable_capture_count']);
  });
});

// Independent review S-H2 (spec G8, G9). A non-2xx GET with a PARSED body can hold a bounded judgment that has no
// fact: a known VOIDED ORDER whose ORDER fact cannot be built, or more than 32 raw captures. W evaluates these
// judgments before the status-only NO_DATA fallback. NO_DATA does not hide a judgment that W already has.
// Both W2 modules exist, so a failure in this block is behavioral RED and not a loading error.
describe('W2 correction S-H2: a non-2xx GET keeps a bounded parsed judgment before the status-only NO_DATA', () => {
  const voidedWithoutMerchant = (captures: Array<Record<string, unknown>> = []) => {
    const body = providerOrder('VOIDED'); delete body.purchase_units[0].payee;
    body.purchase_units[0].payments.captures = captures; return body;
  };
  const withCaptures = (captures: Array<Record<string, unknown>>) => {
    const body = capturedOrder(); body.purchase_units[0].payments.captures = captures; return body;
  };
  const OVERFLOW: Array<[string, () => Array<Record<string, unknown>>]> = [
    ['33 different capture IDs', () => Array.from({ length: 33 }, (_unused, index) => capture(`CAP${index}`))],
    ['33 raw entries of one capture ID', () => Array.from({ length: 33 }, () => capture(CAPTURE))],
  ];

  it('completes a 503 VOIDED ORDER that has no merchant as READ_ADVERSE_UNSPECIFIED with the exact assertion', async () => {
    expect(await collect(parsed(voidedWithoutMerchant(), 503))).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2',
      kind: 'ADVERSE', category: 'READ_ADVERSE_UNSPECIFIED', get_http_status: 503, get_body_status: 'PARSED',
      observed_capture_ids: [], unparseable_capture_count: 0, capture_count_exceeded: false, facts: [],
      assertions: [{ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } }],
      receive_fact_index: null });
  });

  // G9: an ID with the correct format is observed also when its capture cannot be recorded as evidence.
  it('reports the observed capture ID of that 503 VOIDED response and builds no fact', async () => {
    expect(await collect(parsed(voidedWithoutMerchant([capture(CAPTURE)]), 503))).toEqual({
      contract_version: 'web-payment-read-cycle-completion.v2', kind: 'ADVERSE', category: 'READ_ADVERSE_UNSPECIFIED',
      get_http_status: 503, get_body_status: 'PARSED', observed_capture_ids: ['3C679366HH908993F'],
      unparseable_capture_count: 0, capture_count_exceeded: false, facts: [],
      assertions: [{ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } }],
      receive_fact_index: null });
  });

  it.each(OVERFLOW)('completes a 503 response with %s as READ_WORK_BOUND_EXCEEDED with no fact and unknown IDs', async (_label, build) => {
    expect(await collect(parsed(withCaptures(build()), 503))).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2',
      kind: 'ADVERSE', category: 'READ_WORK_BOUND_EXCEEDED', get_http_status: 503, get_body_status: 'PARSED',
      observed_capture_ids: null, unparseable_capture_count: 0, capture_count_exceeded: true, facts: [], assertions: [],
      receive_fact_index: null });
  });

  // The statuses 401, 403, 408 and 429 use the same status-only NO_DATA fallback as 5xx.
  it.each([401, 403, 408, 429])('keeps the VOIDED judgment before the status-only NO_DATA of HTTP %s', async status => {
    expect(await collect(parsed(voidedWithoutMerchant(), status))).toMatchObject({ kind: 'ADVERSE',
      category: 'READ_ADVERSE_UNSPECIFIED', get_http_status: status, get_body_status: 'PARSED', observed_capture_ids: [],
      unparseable_capture_count: 0, capture_count_exceeded: false, facts: [],
      assertions: [{ code: 'UNRECORDABLE_PROVIDER_FACT', detail: { fact_kind: 'ORDER', reason: 'ADVERSE_STATUS_PARTIAL' } }],
      receive_fact_index: null });
  });

  it.each([401, 403, 408, 429])('keeps the raw 33-capture judgment before the status-only NO_DATA of HTTP %s', async status => {
    expect(await collect(parsed(withCaptures(OVERFLOW[0][1]()), status))).toMatchObject({ kind: 'ADVERSE',
      category: 'READ_WORK_BOUND_EXCEEDED', get_http_status: status, get_body_status: 'PARSED', observed_capture_ids: null,
      unparseable_capture_count: 0, capture_count_exceeded: true, facts: [], assertions: [], receive_fact_index: null });
  });

  // Controls. These pass before and after the correction.
  it('control: an ordinary 503 with no provider fact and no judgment stays NO_DATA', async () => {
    const result = await collect(parsed({ name: 'INTERNAL_SERVICE_ERROR', message: 'Q7pPriv temporary', debug_id: 'Q7pPrivDebug' }, 503));
    expect(result).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category: 'READ_HTTP_5XX',
      get_http_status: 503, get_body_status: 'PARSED', observed_capture_ids: null, unparseable_capture_count: 0,
      capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });
    expect(JSON.stringify(result)).not.toContain('Q7pPriv');
  });

  // READ_ORDER_VOIDED is for 2xx only. A VOIDED ORDER fact that can be built on a non-2xx response uses the
  // existing READ_NON_SUCCESS_FACT arm. The actual evidence is kept and no receive index is requested.
  it('control: a representable VOIDED ORDER fact on a 503 response stays READ_NON_SUCCESS_FACT', async () => {
    expect(await collect(parsed(providerOrder('VOIDED'), 503))).toEqual({ contract_version: 'web-payment-read-cycle-completion.v2',
      kind: 'ADVERSE', category: 'READ_NON_SUCCESS_FACT', get_http_status: 503, get_body_status: 'PARSED',
      observed_capture_ids: [], unparseable_capture_count: 0, capture_count_exceeded: false,
      facts: [{ evidence: fact('LOOKUP', 'ORDER', PROVIDER_ORDER, 'VOIDED'), bind: false }], assertions: [],
      receive_fact_index: null });
  });

  // The P1 table for a non-2xx POST is a separate status-only table. The correction does not change it.
  it.each([
    [503, 'NO_RESPONSE', 'HTTP_5XX'], [408, 'NO_RESPONSE', 'HTTP_408'], [429, 'NO_RESPONSE', 'HTTP_429'],
    [422, 'ADVERSE', 'HTTP_REJECTED_4XX'],
  ])('control: a non-2xx POST HTTP %s stays the status-only %s %s for the same parsed bodies', async (status, kind, category) => {
    for (const body of [voidedWithoutMerchant(), withCaptures(OVERFLOW[0][1]())]) {
      expect(await classify(parsed(body, status))).toMatchObject({ kind, category, http_status: status, body_status: 'PARSED',
        post_capture_ids: null, ...NO_FACT_DEFAULTS });
    }
  });
});

// runReadCycle with the real W1 repository. Only RPC delivery, the provider GET and the clock are scripted.
describe('W2 runReadCycle performs open, one GET and one completion', () => {
  type Delivery = { data: unknown; status?: number };
  const OPENED = { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'OPENED', cycle_id: CYCLE,
    cycle_token: CYCLE_TOKEN, generation: '1', deadline_at: '2026-11-14T00:00:45.123456+00:00', superseded_cycle_id: null } };
  const HOLD = { grant_blocked: true, admission_possible: false, get_eligible: true, version: 'e'.repeat(64) };
  const INTAKE = { outcome: 'INTAKE_PENDING', replayed: false, order_id: ORDER, inbox_id: '99999999-9999-4999-8999-999999999999',
    receipt_id: '9007199254740993', coverage: 'SCOPE_ONLY', grant_eligible: false };
  const LOST = { status: 503, data: { code: 'XX000', message: 'Q7pPriv ACK lost' } };
  // S3 ACK. It echoes the requested kind and returns one result for each sent fact.
  const completed = (intake: unknown = null) => (args: Record<string, any>): Delivery => ({ data: {
    contract_version: 'web-payment-read-cycle-result.v1', outcome: 'COMPLETED', replayed: false, cycle_id: args.p_cycle_id,
    generation: '1', requested_kind: args.p_completion.kind, effective_kind: args.p_completion.kind,
    db_adverse: args.p_completion.kind === 'ADVERSE',
    fact_results: args.p_completion.facts.map((_fact: unknown, index: number) => ({
      observation_id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, '0')}`, outcome: 'RECORDED', reason_code: null })),
    assertion_ids: [], intake, hold: HOLD } });
  const OPEN = 'open_web_payment_read_cycle'; const COMPLETE = 'complete_web_payment_read_cycle';

  function harness(script: Record<string, Array<Delivery | ((args: Record<string, any>) => Delivery)>>) {
    const trail: string[] = []; const calls: Array<{ name: string; args: Record<string, any> }> = [];
    const rpcFetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const prefix = 'https://scripted-db.example.invalid/rest/v1/rpc/';
      if (!String(url).startsWith(prefix) || init.method !== 'POST') throw new Error('Unexpected external operation');
      const name = String(url).slice(prefix.length); const args = JSON.parse(init.body as string);
      calls.push({ name, args }); trail.push(name);
      const reply = script[name]?.shift(); if (!reply) throw new Error('Unscripted RPC');
      const { data, status = 200 } = typeof reply === 'function' ? reply(args) : reply;
      return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
    });
    const client = createClient('https://scripted-db.example.invalid', 'synthetic-service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: rpcFetch } });
    const getOrder = vi.fn().mockImplementation(async () => parsed(capturedOrder()));
    const refused = () => { throw new Error('Unexpected provider call'); };
    const transport = { requestToken: vi.fn(refused), createOrder: vi.fn(refused), captureOrder: vi.fn(refused),
      getOrder: (request: unknown) => { trail.push('get'); return getOrder(request); } };
    const controller = new AbortController(); let clock = NOW;
    const windowFor = (remainingMs: number) => ({ deadlineAtMs: NOW + remainingMs, signal: controller.signal, nowMs: () => clock });
    const run = async (actorKind: string, window?: unknown) => (await load('read-cycle')).runReadCycle(
      { repository: createWebPaymentChargeRepository(client), transport, nowMs: () => clock },
      { actorUserId: ACTOR, orderId: ORDER, context: CONTEXT_ROW, binding: BINDING, accessToken: 'Q7pPriv-token', actorKind,
        ...(window ? { window } : {}) });
    const named = (name: string) => calls.filter(call => call.name === name);
    return { trail, calls, named, getOrder, transport, controller, windowFor, run, advance: (ms: number) => { clock += ms; } };
  }
  // The spy is evidence of the timeout argument that the product passes and of cancellation reaching the GET signal.
  // It is not evidence of real elapsed time.
  function fakeDeadlines() {
    const timers: Array<{ ms: number; controller: AbortController }> = [];
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController(); timers.push({ ms, controller }); return controller.signal; });
    const firedBy = (signal: unknown) => {
      if (!(signal instanceof AbortSignal) || signal.aborted) return null;
      for (const timer of timers) { timer.controller.abort(); if (signal.aborted) return timer.ms; }
      return null;
    };
    return { timers, firedBy };
  }
  const NO_DATA = (category: string) => ({ contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA', category,
    get_http_status: null, get_body_status: null, observed_capture_ids: null, unparseable_capture_count: 0,
    capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null });

  it('opens, sends one GET, completes once and reports the DB effective result', async () => {
    const h = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed(INTAKE)] });
    const report = await h.run('USER_RECONCILE');
    expect(h.trail).toEqual([OPEN, 'get', COMPLETE]);
    expect(h.named(OPEN)[0].args).toEqual({ p_actor_user_id: ACTOR, p_order_id: ORDER, p_actor_kind: 'USER_RECONCILE' });
    expect(h.getOrder.mock.calls).toHaveLength(1);
    expect(h.getOrder.mock.calls[0][0]).toMatchObject({ environment: 'SANDBOX', accessToken: 'Q7pPriv-token', providerOrderId: PROVIDER_ORDER });
    expect(h.named(COMPLETE)[0].args).toMatchObject({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN,
      p_completion: { kind: 'CLEAN', category: 'READ_CAPTURE_COMPLETED', observed_capture_ids: [CAPTURE], receive_fact_index: 1 } });
    expect(report).toMatchObject({ kind: 'COMPLETED', effectiveKind: 'CLEAN', opened: true, readCancelled: false, cycleId: CYCLE,
      intake: { kind: 'INTAKE_PENDING', replayed: false, orderId: ORDER } });
    expect(JSON.stringify(report)).not.toContain(CYCLE_TOKEN);
    expect(JSON.stringify(report)).not.toContain('Q7pPriv');
  });

  it.each([
    ['NOT_APPLICABLE', { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'NOT_APPLICABLE' } }, 'NOT_APPLICABLE'],
    ['READ_IN_PROGRESS', { data: { contract_version: 'web-payment-read-cycle-open.v1', outcome: 'READ_IN_PROGRESS',
      deadline_at: '2026-11-14T00:00:45.123456+00:00' } }, 'IN_PROGRESS'],
  ])('sends no GET and no completion after OPEN reply %s', async (_label, reply, reason) => {
    const h = harness({ [OPEN]: [reply] });
    expect(await h.run('SCANNER')).toMatchObject({ kind: 'NOT_OPENED', reason, opened: false });
    expect(h.trail).toEqual([OPEN]); expect(h.getOrder).toHaveBeenCalledTimes(0);
  });

  it('sends no GET when the OPEN ACK is lost', async () => {
    const h = harness({ [OPEN]: [LOST] });
    const report = await h.run('SCANNER');
    expect(['NOT_OPENED', 'WRITE_UNKNOWN']).toContain(report.kind);
    expect(h.trail).toEqual([OPEN]); expect(h.getOrder).toHaveBeenCalledTimes(0);
    expect(JSON.stringify(report)).not.toContain('Q7pPriv');
  });

  it.each([
    ['a lost completion ACK', LOST, 'WRITE_UNKNOWN'],
    ['LATE_RECORDED', { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'LATE_RECORDED', replayed: false,
      late_id: CONTEXT, effective_kind: 'CLEAN' } }, 'LATE'],
    ['CONFLICT_RECORDED', { data: { contract_version: 'web-payment-read-cycle-result.v1', outcome: 'CONFLICT_RECORDED',
      replayed: false, conflict_id: CONTEXT } }, 'CONFLICT'],
  ])('reports %s without a second GET or a second completion and without an intake', async (_label, reply, kind) => {
    const h = harness({ [OPEN]: [OPENED], [COMPLETE]: [reply] });
    const report = await h.run('SCANNER');
    expect(report).toMatchObject({ kind, opened: true });
    expect(report.intake ?? null).toBeNull();
    expect(h.trail).toEqual([OPEN, 'get', COMPLETE]);
    expect(JSON.stringify(report)).not.toMatch(/eeeeeeee|Q7pPriv/);
  });

  it('gives the GET a deadline at the remaining 500 ms and propagates the parent cancellation', async () => {
    const deadlines = fakeDeadlines(); const h = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed()] });
    await h.run('SCANNER', h.windowFor(500));
    const signal = h.getOrder.mock.calls[0]?.[0]?.signal;
    expect(signal).toBeInstanceOf(AbortSignal); expect(signal.aborted).toBe(false);
    expect(deadlines.timers.filter(timer => timer.ms === 500)).toHaveLength(1);
    h.controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('fires the GET deadline at 500 ms and caps it at 10 s when 20 s remain', async () => {
    const short = fakeDeadlines(); const a = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed()] });
    await a.run('SCANNER', a.windowFor(500));
    expect(short.firedBy(a.getOrder.mock.calls[0]?.[0]?.signal)).toBe(500);
    vi.restoreAllMocks();
    const long = fakeDeadlines(); const b = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed()] });
    await b.run('SCANNER', b.windowFor(20_000));
    expect(long.timers.map(timer => timer.ms)).not.toContain(20_000);
    expect(long.firedBy(b.getOrder.mock.calls[0]?.[0]?.signal)).toBe(10_000);
  });

  it.each([
    ['the budget ended during OPEN', 'READ_LOCAL_BUDGET_EXHAUSTED', false],
    ['the window was cancelled during OPEN', 'READ_LOCAL_CANCELLED', true],
  ] as const)('completes with explicit NO_DATA and sends no GET when %s', async (_label, category, cancelled) => {
    const script: Parameters<typeof harness>[0] = { [COMPLETE]: [completed()] };
    const h = harness(script);
    // The OPEN reply ends the budget or cancels the window before the GET can start.
    script[OPEN] = [() => { if (cancelled) h.controller.abort(); else h.advance(20_000); return OPENED; }];
    const report = await h.run('SCANNER', h.windowFor(20_000));
    expect(h.trail).toEqual([OPEN, COMPLETE]); expect(h.getOrder).toHaveBeenCalledTimes(0);
    // The completion write is awaited after the read window ended.
    expect(h.named(COMPLETE)[0].args).toEqual({ p_cycle_id: CYCLE, p_cycle_token: CYCLE_TOKEN, p_completion: NO_DATA(category) });
    expect(report).toMatchObject({ kind: 'COMPLETED', effectiveKind: 'NO_DATA', opened: true, readCancelled: cancelled, cycleId: CYCLE });
  });

  it('uses the actual transport classification when a started GET is cancelled', async () => {
    const h = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed()] });
    h.getOrder.mockImplementation(async () => { h.controller.abort(); return { kind: 'TRANSPORT_UNKNOWN' }; });
    const report = await h.run('SCANNER', h.windowFor(20_000));
    expect(h.trail).toEqual([OPEN, 'get', COMPLETE]);
    expect(h.named(COMPLETE)[0].args.p_completion).toEqual(NO_DATA('READ_TRANSPORT_UNKNOWN'));
    expect(report).toMatchObject({ kind: 'COMPLETED', effectiveKind: 'NO_DATA', opened: true, readCancelled: true });
  });

  it('keeps a parsed adverse judgment when the window is cancelled after the GET returned', async () => {
    const h = harness({ [OPEN]: [OPENED], [COMPLETE]: [completed()] });
    h.getOrder.mockImplementation(async () => { h.controller.abort(); return parsed(capturedOrder('DECLINED')); });
    await h.run('SCANNER', h.windowFor(20_000));
    expect(h.named(COMPLETE)[0].args.p_completion).toMatchObject({ kind: 'ADVERSE', category: 'READ_ADVERSE_FACT',
      observed_capture_ids: [CAPTURE] });
  });
});
