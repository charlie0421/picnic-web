// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRpcProviderEntryGate, type ProviderEntryInput } from '@/lib/payment/paypal-charge/provider-entry';
import { ChargeRepositoryError } from '@/lib/payment/paypal-charge/repository';

const INPUT = Object.freeze({
  actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
});
// Hand-checked wire literals and expected decisions do not use a production builder or parser.
const AUTHORIZED = Object.freeze({
  contract_version: 'web-payment-provider-entry.v1', outcome: 'AUTHORIZED', charge_authority: false,
  order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  create_request_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  entry_not_after: '2028-02-29T12:34:56.123456+00:00',
});
const NOT_FOUND = Object.freeze({
  contract_version: 'web-payment-provider-entry.v1', outcome: 'NOT_FOUND', charge_authority: false,
});
const ORDER_LINKED = Object.freeze({
  contract_version: 'web-payment-provider-entry.v1', outcome: 'ORDER_LINKED', charge_authority: false,
});
const BLOCKED = Object.freeze({
  contract_version: 'web-payment-provider-entry.v1', outcome: 'BLOCKED', charge_authority: false,
  safe_reason_code: 'ORDERS_CLOSED',
});
const rpcFetch = vi.fn<typeof fetch>();
let wire: unknown;
let status: number;

function client() {
  return createClient('https://entry-db.example.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: rpcFetch },
  });
}

function gate() { return createRpcProviderEntryGate(client()); }

async function expectSafeError(operation: Promise<unknown>, stage: 'CONFIG' | 'RPC' | 'RESPONSE') {
  const caught: unknown = await operation.then(() => undefined, (error: unknown) => error);
  expect(caught).toBeInstanceOf(ChargeRepositoryError);
  expect(caught).toMatchObject({ stage, message: 'WEB_PAYMENT_CHARGE_UNAVAILABLE' });
  expect(String(caught)).not.toContain('Q7pPriv');
  expect(JSON.stringify(caught)).not.toContain('Q7pPriv');
  expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught))).not.toContain('Q7pPriv');
  expect(caught).not.toHaveProperty('cause');
}

beforeEach(() => {
  wire = AUTHORIZED; status = 200;
  rpcFetch.mockReset().mockImplementation(async () => new Response(JSON.stringify(wire), {
    status, headers: { 'content-type': 'application/json' },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('RPC provider entry gate', () => {
  // B1 catches wrong RPC/args, input-field leakage, GET, and a missing/wrong timeout.
  // Pinned postgrest-js never retries POST; fetch1/no X-Retry-Count characterize that behavior.
  // retry(false) is defensive configuration; these assertions do not detect its removal.
  it('posts one non-retried entry RPC with exact five arguments and a 10s signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const input = Object.freeze({ ...INPUT, secret: 'Q7pPriv', chargeAuthority: true });
    await gate().authorizeProviderEntry(input);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    const [url, init] = rpcFetch.mock.calls[0];
    expect(url).toBe('https://entry-db.example.invalid/rest/v1/rpc/authorize_web_payment_provider_entry');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      p_actor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      p_create_request_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      p_binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).toBe(timeout.mock.results[0].value);
    expect(new Headers(init?.headers).get('x-retry-count')).toBeNull();
  });

  // B2 catches an empty/default decision, wrong projection, or leaked native authority/DTO fields.
  it('maps exact AUTHORIZED to the complete camelCase decision', async () => {
    expect(await gate().authorizeProviderEntry(INPUT)).toEqual({
      kind: 'AUTHORIZED', orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      quoteHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      entryNotAfter: '2028-02-29T12:34:56.123456+00:00',
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    expect(INPUT).toEqual({
      actorUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  // B3 catches rejecting explicit offsets or normalizing away microseconds/the original string.
  it.each([
    '2028-02-29T12:34:56.123456+00:00',
    '2028-02-29T12:34:56.123456Z',
    '2028-02-29T21:34:56.123456+09:00',
  ])('accepts the same instant in +00:00, Z and +09:00 forms: %s', async timestamp => {
    wire = { ...AUTHORIZED, entry_not_after: timestamp };
    expect(await gate().authorizeProviderEntry(INPUT)).toEqual({
      kind: 'AUTHORIZED', orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      quoteHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      entryNotAfter: timestamp,
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // B4: each row catches omission of its named timestamp constraint (Date.parse alone can normalize dates).
  it.each<[string, unknown]>([
    ['date only', '2028-02-29'], ['local timezone', '2028-02-29T12:34:56'],
    ['seven fraction digits', '2028-02-29T12:34:56.1234567Z'],
    ['five-digit year', '12028-02-29T12:34:56Z'],
    ['empty fraction', '2028-02-29T12:34:56.Z'],
    ['nonleap February', '2027-02-29T12:34:56Z'],
    ['century nonleap February', '1900-02-29T12:34:56Z'],
    ['February 30', '2028-02-30T12:34:56Z'], ['April 31', '2028-04-31T12:34:56Z'],
    ['month zero', '2028-00-29T12:34:56Z'], ['month 13', '2028-13-29T12:34:56Z'],
    ['day zero', '2028-02-00T12:34:56Z'], ['day 32', '2028-01-32T12:34:56Z'],
    ['hour 24', '2028-02-29T24:00:00Z'], ['minute 60', '2028-02-29T12:60:00Z'],
    ['second 60', '2028-02-29T12:34:60Z'],
    ['positive offset hour 24', '2028-02-29T12:34:56+24:00'],
    ['negative offset hour 24', '2028-02-29T12:34:56-24:00'],
    ['positive offset minute 60', '2028-02-29T12:34:56+09:60'],
    ['negative offset minute 60', '2028-02-29T12:34:56-09:60'],
    ['compact offset', '2028-02-29T12:34:56+0900'], ['short offset', '2028-02-29T12:34:56+09'],
    ['space separator', '2028-02-29 12:34:56Z'],
    ['trailing junk', '2028-02-29T12:34:56ZQ7pPriv'],
    ['leading whitespace', ' 2028-02-29T12:34:56Z'],
    ['trailing newline', '2028-02-29T12:34:56Z\n'],
    ['empty', ''], ['null', null], ['number', 1], ['array', []],
  ])('rejects offset-less, 7-digit fraction and impossible calendar timestamps: %s', async (_name, timestamp) => {
    wire = { ...AUTHORIZED, entry_not_after: timestamp };
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // Year 0000 leap day catches Date.UTC's remapping to nonleap 1900; other rows cover calendar/format boundaries.
  // Historical deadlines remain data: this client must not add a local expiry decision.
  it.each([
    '0000-02-29T00:00:00Z',
    '0001-01-01T00:00:00Z', '0099-12-31T23:59:59Z', '0100-01-01T00:00:00Z',
    '2000-02-29T00:00:00Z', '2400-02-29T23:59:59Z', '2028-04-30T12:34:56Z',
    '2028-02-29T12:34:56.1Z', '2028-02-29T12:34:56.12345Z',
    '2028-02-29T12:34:56-09:30', '2028-02-29T12:34:56+23:59', '2028-02-29T12:34:56-23:59',
  ])('preserves valid timestamp boundary %s', async timestamp => {
    wire = { ...AUTHORIZED, entry_not_after: timestamp };
    expect(await gate().authorizeProviderEntry(INPUT)).toMatchObject({ kind: 'AUTHORIZED', entryNotAfter: timestamp });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // B5 catches independently skipped echo comparisons and coercion/permissive hash matching.
  it.each<[string, Record<string, unknown>]>([
    ['order_id mismatch', { order_id: '11111111-1111-4111-8111-111111111111' }],
    ['context_id mismatch', { context_id: '22222222-2222-4222-8222-222222222222' }],
    ['create_request_key mismatch', { create_request_key: '33333333-3333-4333-8333-333333333333' }],
    ['binding_hash mismatch', { binding_hash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc' }],
    ['order_id null', { order_id: null }], ['context_id number', { context_id: 1 }],
    ['create_request_key array', { create_request_key: [] }], ['binding_hash number', { binding_hash: 1 }],
    ['order_id trailing newline', { order_id: INPUT.orderId + '\n' }],
    ['context_id uppercase', { context_id: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC' }],
    ['create_request_key trailing newline', { create_request_key: INPUT.createRequestKey + '\n' }],
    ['binding_hash trailing newline', { binding_hash: INPUT.bindingHash + '\n' }],
    ['quote_hash nonhex', { quote_hash: 'Q7pPriv' }], ['quote_hash uppercase', { quote_hash: 'A'.repeat(64) }],
    ['quote_hash short', { quote_hash: 'a'.repeat(63) }], ['quote_hash long', { quote_hash: 'a'.repeat(65) }],
    ['quote_hash trailing newline', { quote_hash: 'a'.repeat(64) + '\n' }],
    ['quote_hash null', { quote_hash: null }], ['quote_hash number', { quote_hash: 1 }],
  ])('rejects AUTHORIZED echo/hash violation %s', async (_name, patch) => {
    wire = { ...AUTHORIZED, ...patch };
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // B6 catches synthesizing authority or conflating the two native3 decisions.
  it.each([
    ['ORDER_LINKED', ORDER_LINKED, { kind: 'ORDER_LINKED' }],
    ['NOT_FOUND', NOT_FOUND, { kind: 'NOT_FOUND' }],
  ])('maps exact native3 decision %s', async (_outcome, dto, expected) => {
    wire = dto;
    expect(await gate().authorizeProviderEntry(INPUT)).toEqual(expected);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // B7 literal table is independent of the exported union/runtime implementation reason list.
  // Every row catches a missing reason or a wrong BLOCKED projection.
  it.each([
    'INPUT_INVALID', 'PROVIDER_UNSUPPORTED', 'CONTEXT_REQUIRED', 'VERIFICATION_BINDING_REQUIRED',
    'CONTEXT_MISMATCH', 'BINDING_MISMATCH', 'ORDER_STATE_INVALID', 'ACTOR_DELETED',
    'SETTINGS_UNAVAILABLE', 'ENVIRONMENT_MISMATCH', 'ORDERS_CLOSED', 'CHARGE_CLOSED',
    'COUNTRY_NOT_ALLOWED', 'ACTOR_NOT_ALLOWED', 'POLICY_UNAVAILABLE', 'POLICY_NOT_ACCEPTED',
    'QUOTE_EXPIRED', 'PRODUCT_UNAVAILABLE', 'REVIEW_REQUIRED', 'VERIFICATION_BINDING_CHANGED', 'PROVIDER_SCOPE_CHANGED',
  ])('maps exact BLOCKED reason %s', async reason => {
    wire = { contract_version: 'web-payment-provider-entry.v1', outcome: 'BLOCKED', charge_authority: false,
      safe_reason_code: reason };
    expect(await gate().authorizeProviderEntry(INPUT)).toEqual({ kind: 'BLOCKED', reason });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // B8 catches permissive object/key/contract/reason parsing; each row introduces one defect.
  it.each<[string, unknown]>([
    ['unknown reason', { ...BLOCKED, safe_reason_code: 'Q7pPriv' }],
    ['capture-only reason', { ...BLOCKED, safe_reason_code: 'LEASE_EXPIRED' }],
    ['lowercase reason', { ...BLOCKED, safe_reason_code: 'orders_closed' }],
    ['reason newline', { ...BLOCKED, safe_reason_code: 'ORDERS_CLOSED\n' }],
    ['numeric reason', { ...BLOCKED, safe_reason_code: 1 }],
    ['null reason', { ...BLOCKED, safe_reason_code: null }],
    ['array reason', { ...BLOCKED, safe_reason_code: ['ORDERS_CLOSED'] }],
    ['BLOCKED extra key', { ...BLOCKED, secret: 'Q7pPriv' }],
    ['NOT_FOUND extra key', { ...NOT_FOUND, secret: 'Q7pPriv' }],
    ['ORDER_LINKED extra key', { ...ORDER_LINKED, secret: 'Q7pPriv' }],
    ['AUTHORIZED extra key', { ...AUTHORIZED, secret: 'Q7pPriv' }],
    ['AUTHORIZED same-size renamed key', { ...AUTHORIZED, quote_hash: undefined, quoteHash: AUTHORIZED.quote_hash }],
    ['unknown outcome', { ...NOT_FOUND, outcome: 'Q7pPriv' }],
    ['numeric outcome', { ...NOT_FOUND, outcome: 1 }],
    ['lowercase outcome', { ...NOT_FOUND, outcome: 'not_found' }],
    ['AUTHORIZED unknown outcome', { ...AUTHORIZED, outcome: 'Q7pPriv' }],
    ['AUTHORIZED lowercase outcome', { ...AUTHORIZED, outcome: 'authorized' }],
    ['AUTHORIZED numeric outcome', { ...AUTHORIZED, outcome: 1 }],
    ['null body', null], ['array body', []], ['array of DTOs', [AUTHORIZED]],
    ['string body', 'Q7pPriv'], ['numeric body', 1], ['boolean body', false],
  ])('rejects malformed entry DTO %s', async (_name, dto) => {
    wire = dto;
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // Each outcome must independently retain the native contract and the false authority marker.
  describe.each([
    ['AUTHORIZED', AUTHORIZED], ['ORDER_LINKED', ORDER_LINKED], ['NOT_FOUND', NOT_FOUND], ['BLOCKED', BLOCKED],
  ] as const)('%s common contract', (_outcome, dto) => {
    it.each<[string, Record<string, unknown>]>([
      ['authority true', { charge_authority: true }], ['authority string', { charge_authority: 'false' }],
      ['authority null', { charge_authority: null }], ['authority numeric zero', { charge_authority: 0 }],
      ['wrong contract', { contract_version: 'Q7pPriv' }], ['numeric contract', { contract_version: 1 }],
    ])('rejects %s', async (_name, patch) => {
      wire = { ...dto, ...patch };
      await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
      expect(rpcFetch).toHaveBeenCalledTimes(1);
    });
  });

  // All required keys are literal inventories; deletion isolates each missing-key counterexample.
  it.each(['contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id',
    'create_request_key', 'quote_hash', 'binding_hash', 'entry_not_after'])('rejects AUTHORIZED missing %s', async key => {
    const dto: Record<string, unknown> = { ...AUTHORIZED };
    delete dto[key]; wire = dto;
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  describe.each([
    ['NOT_FOUND', NOT_FOUND, ['contract_version', 'outcome', 'charge_authority']],
    ['ORDER_LINKED', ORDER_LINKED, ['contract_version', 'outcome', 'charge_authority']],
    ['BLOCKED', BLOCKED, ['contract_version', 'outcome', 'charge_authority', 'safe_reason_code']],
  ] as const)('%s required keys', (_outcome, original, keys) => {
    it.each(keys)('rejects missing %s', async key => {
      const dto: Record<string, unknown> = { ...original };
      delete dto[key]; wire = dto;
      await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
      expect(rpcFetch).toHaveBeenCalledTimes(1);
    });
  });

  // B9 catches raw SDK/transport details escaping and RPC errors being returned as decisions.
  // POST fetch1 characterizes the pinned SDK; it cannot prove defensive retry(false) is present.
  it.each<[number, string, string]>([
    [400, 'P0001', 'WEB_PAYMENT_PROVIDER_ENTRY_ISOLATION_UNSUPPORTED'],
    [400, 'P0001', 'WEB_PAYMENT_PROVIDER_ENTRY_INVALID'],
    [400, 'P0001', 'WEB_PAYMENT_PROVIDER_BINDING_INVALID'],
    [401, '42501', 'Q7pPriv'], [403, '42501', 'Q7pPriv'], [503, 'Q7pPriv', 'Q7pPriv'],
  ])('closes HTTP %i %s %s without retry or raw error leakage', async (httpStatus, code, message) => {
    status = httpStatus; wire = { code, message, details: 'Q7pPriv', hint: 'Q7pPriv' };
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RPC');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['fetch rejection', new Error('Q7pPriv', { cause: new Error('Q7pPriv nested') })],
    ['AbortError', new DOMException('Q7pPriv', 'AbortError')],
  ])('closes %s without retry or thrown-value leakage', async (_name, error) => {
    rpcFetch.mockRejectedValue(error);
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RPC');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  // This single dependency fault injection uses a real client; normal DTO paths retain the actual SDK builder.
  it('closes synchronous rpc throw without leaking the thrown value', async () => {
    const actualClient = client();
    vi.spyOn(actualClient, 'rpc').mockImplementation(() => { throw new Error('Q7pPriv'); });
    await expectSafeError(createRpcProviderEntryGate(actualClient).authorizeProviderEntry(INPUT), 'RPC');
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  // F3 catches accepting non-200 SDK statuses or classifying SDK-normalized 404 empty as RESPONSE.
  it.each<[string, number, string | null]>([
    ['201 DTO', 201, JSON.stringify(AUTHORIZED)],
    ['202 DTO', 202, JSON.stringify(AUTHORIZED)],
    ['206 DTO', 206, JSON.stringify(AUTHORIZED)],
    ['204 empty', 204, null],
    ['404 empty normalized to 204', 404, ''],
    ['404 object', 404, '{"message":"Q7pPriv","details":"Q7pPriv"}'],
    ['200 non-JSON', 200, 'Q7pPriv'],
  ])('closes SDK boundary %s as safe RPC', async (_name, httpStatus, body) => {
    rpcFetch.mockImplementationOnce(async () => new Response(body, {
      status: httpStatus, headers: { 'content-type': 'application/json' },
    }));
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RPC');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // The pinned SDK turns HTTP 404 [] into status 200/data []; the gate cannot distinguish it from HTTP 200 [].
  it('retains safe RESPONSE for SDK-normalized 404 array', async () => {
    rpcFetch.mockImplementationOnce(async () => new Response('[]', {
      status: 404, headers: { 'content-type': 'application/json' },
    }));
    await expectSafeError(gate().authorizeProviderEntry(INPUT), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // F2 catches rereading getters for the RPC body or response echo after validating a different tuple.
  it('reads each input field once and uses the first tuple for request and echo', async () => {
    const reads = { actorUserId: 0, orderId: 0, contextId: 0, createRequestKey: 0, bindingHash: 0 };
    const input: ProviderEntryInput = {
      get actorUserId() {
        return ++reads.actorUserId === 1 ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : '11111111-1111-4111-8111-111111111111';
      },
      get orderId() {
        return ++reads.orderId === 1 ? 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' : '22222222-2222-4222-8222-222222222222';
      },
      get contextId() {
        return ++reads.contextId === 1 ? 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' : '33333333-3333-4333-8333-333333333333';
      },
      get createRequestKey() {
        return ++reads.createRequestKey === 1 ? 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' : '44444444-4444-4444-8444-444444444444';
      },
      get bindingHash() {
        return ++reads.bindingHash === 1 ? 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
          : 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
      },
    };
    expect(await gate().authorizeProviderEntry(input)).toEqual({
      kind: 'AUTHORIZED', orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      quoteHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      entryNotAfter: '2028-02-29T12:34:56.123456+00:00',
    });
    expect(reads).toEqual({ actorUserId: 1, orderId: 1, contextId: 1, createRequestKey: 1, bindingHash: 1 });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(rpcFetch.mock.calls[0][1]?.body as string)).toEqual({
      p_actor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      p_create_request_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      p_binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  // Each row catches a getter exception escaping the safe CONFIG boundary before fetch.
  it.each(['actorUserId', 'orderId', 'contextId', 'createRequestKey', 'bindingHash'] as const)(
    'closes throwing input getter %s as safe CONFIG before fetch', async field => {
      const input = { ...INPUT };
      Object.defineProperty(input, field, { get() { throw new Error('Q7pPriv', { cause: new Error('Q7pPriv nested') }); } });
      await expectSafeError(gate().authorizeProviderEntry(input), 'CONFIG');
      expect(rpcFetch).not.toHaveBeenCalled();
    },
  );

  // F2 catches comparing the response with caller mutations made after the original request was sent.
  it('keeps the original request snapshot after caller mutation during fetch', async () => {
    const input: ProviderEntryInput = { ...INPUT };
    let markDispatched!: () => void;
    const dispatched = new Promise<void>(resolve => { markDispatched = resolve; });
    let respond!: () => void;
    rpcFetch.mockImplementationOnce(() => new Promise<Response>(resolve => {
      respond = () => resolve(new Response(JSON.stringify(AUTHORIZED), {
        status: 200, headers: { 'content-type': 'application/json' },
      }));
      markDispatched();
    }));
    const operation = gate().authorizeProviderEntry(input);
    await dispatched;
    input.actorUserId = '11111111-1111-4111-8111-111111111111';
    input.orderId = '22222222-2222-4222-8222-222222222222';
    input.contextId = '33333333-3333-4333-8333-333333333333';
    input.createRequestKey = '44444444-4444-4444-8444-444444444444';
    input.bindingHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
    respond();
    expect(await operation).toEqual({
      kind: 'AUTHORIZED', orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      createRequestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      quoteHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      entryNotAfter: '2028-02-29T12:34:56.123456+00:00',
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(rpcFetch.mock.calls[0][1]?.body as string)).toEqual({
      p_actor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      p_context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      p_create_request_key: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      p_binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  // B10 catches missing input checks and normalization/coercion before a request is sent.
  describe.each(['actorUserId', 'orderId', 'contextId', 'createRequestKey'] as const)('%s input', field => {
    it.each<[string, unknown]>([
      ['uppercase', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'], ['empty', ''], ['non-UUID', 'Q7pPriv'],
      ['trailing newline', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\n'],
      ['leading whitespace', ' aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      ['compact', 'aaaaaaaaaaaa4aaa8aaaaaaaaaaaaaaa'], ['null', null], ['number', 1], ['array', []],
    ])('rejects %s before fetch', async (_name, value) => {
      await expectSafeError(gate().authorizeProviderEntry({ ...INPUT, [field]: value } as ProviderEntryInput), 'CONFIG');
      expect(rpcFetch).not.toHaveBeenCalled();
    });
  });
  it.each<[string, unknown]>([
    ['empty', ''], ['nonhex', 'Q7pPriv'], ['uppercase', 'B'.repeat(64)],
    ['short', 'b'.repeat(63)], ['long', 'b'.repeat(65)], ['trailing newline', 'b'.repeat(64) + '\n'],
    ['null', null], ['number', 1], ['array', []],
  ])('rejects invalid bindingHash %s before fetch', async (_name, value) => {
    await expectSafeError(gate().authorizeProviderEntry({ ...INPUT, bindingHash: value } as ProviderEntryInput), 'CONFIG');
    expect(rpcFetch).not.toHaveBeenCalled();
  });
  it.each(['actorUserId', 'orderId', 'contextId', 'createRequestKey', 'bindingHash'])('rejects input missing %s before fetch', async key => {
    const input: Record<string, unknown> = { ...INPUT };
    delete input[key];
    await expectSafeError(gate().authorizeProviderEntry(input as ProviderEntryInput), 'CONFIG');
    expect(rpcFetch).not.toHaveBeenCalled();
  });
  it.each<[string, unknown]>([
    ['null', null], ['undefined', undefined], ['array', []], ['string', 'Q7pPriv'], ['number', 1],
  ])('closes invalid runtime input shape %s before fetch', async (_name, input) => {
    await expectSafeError(gate().authorizeProviderEntry(input as ProviderEntryInput), 'CONFIG');
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  // SQL's UUID type accepts canonical values without a v4/version or variant-bit requirement.
  it('accepts canonical non-v4 UUIDs and the full lowercase hex range', async () => {
    const input = Object.freeze({
      actorUserId: 'aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa', orderId: 'bbbbbbbb-bbbb-1bbb-0bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-2ccc-0ccc-cccccccccccc', createRequestKey: 'dddddddd-dddd-fddd-fddd-dddddddddddd',
      bindingHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    wire = { ...AUTHORIZED, order_id: 'bbbbbbbb-bbbb-1bbb-0bbb-bbbbbbbbbbbb',
      context_id: 'cccccccc-cccc-2ccc-0ccc-cccccccccccc', create_request_key: 'dddddddd-dddd-fddd-fddd-dddddddddddd',
      binding_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      quote_hash: '0000000000000000000000000000000000000000000000000000000000000000' };
    expect(await gate().authorizeProviderEntry(input)).toEqual({
      kind: 'AUTHORIZED', orderId: 'bbbbbbbb-bbbb-1bbb-0bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-2ccc-0ccc-cccccccccccc', createRequestKey: 'dddddddd-dddd-fddd-fddd-dddddddddddd',
      bindingHash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      quoteHash: '0000000000000000000000000000000000000000000000000000000000000000',
      entryNotAfter: '2028-02-29T12:34:56.123456+00:00',
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(rpcFetch.mock.calls[0][1]?.body as string)).toEqual({
      p_actor_user_id: 'aaaaaaaa-aaaa-0aaa-0aaa-aaaaaaaaaaaa', p_order_id: 'bbbbbbbb-bbbb-1bbb-0bbb-bbbbbbbbbbbb',
      p_context_id: 'cccccccc-cccc-2ccc-0ccc-cccccccccccc', p_create_request_key: 'dddddddd-dddd-fddd-fddd-dddddddddddd',
      p_binding_hash: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
  });
});
