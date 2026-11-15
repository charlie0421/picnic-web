// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRpcChargeBindingSource } from '@/lib/payment/paypal-charge/binding-source';
import { ChargeRepositoryError } from '@/lib/payment/paypal-charge/repository';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORDER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
// Independent wire literals; neither SQL nor a production parser builds these fixtures.
const FOUND = {
  contract_version: 'web-payment-provider-binding.v1', outcome: 'FOUND', charge_authority: false,
  order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  context_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  quote_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  quote_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  provider: 'PAYPAL', environment: 'SANDBOX', billing_country: 'US',
  scope: { account_id: 'Account_1.a:-', merchant_id: 'Merchant_2.b:-' },
  binding_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', binding_version: '9007199254740993',
  binding_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  credential_ref: 'Paypal_1.ref-', expected_application: { paypal_client_id: 'Client_3.c:-' },
};
const NOT_FOUND = {
  contract_version: 'web-payment-provider-binding.v1', outcome: 'NOT_FOUND', charge_authority: false,
};
const rpcFetch = vi.fn<typeof fetch>();
let wire: unknown;
let status: number;

function source() {
  return createRpcChargeBindingSource(createClient('https://binding-db.example.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: rpcFetch },
  }));
}

async function expectSafeError(operation: Promise<unknown>, stage: 'CONFIG' | 'RPC' | 'RESPONSE') {
  const caught: unknown = await operation.then(() => undefined, (error: unknown) => error);
  expect(caught).toBeInstanceOf(ChargeRepositoryError);
  expect(caught).toMatchObject({ stage, message: 'WEB_PAYMENT_CHARGE_UNAVAILABLE' });
  expect(String(caught)).not.toContain('Q7pPriv');
  expect(JSON.stringify(caught)).not.toContain('Q7pPriv');
  expect(JSON.stringify(caught, Object.getOwnPropertyNames(caught))).not.toContain('Q7pPriv');
}

beforeEach(() => {
  wire = FOUND; status = 200;
  rpcFetch.mockReset().mockImplementation(async () => new Response(JSON.stringify(wire), {
    status, headers: { 'content-type': 'application/json' },
  }));
});
afterEach(() => { vi.restoreAllMocks(); });

describe('RPC charge binding source', () => {
  // A1 catches wrong RPC/args, GET, and missing timeout.
  // Pinned postgrest-js never retries POST; fetch1/no X-Retry-Count characterize that behavior.
  // retry(false) is defensive; these assertions do not detect its removal.
  it('posts one non-retried binding RPC with a 10s abort signal', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await source().getProviderBinding(ACTOR, ORDER);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
    const [url, init] = rpcFetch.mock.calls[0];
    expect(url).toBe('https://binding-db.example.invalid/rest/v1/rpc/get_web_payment_provider_binding');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      p_actor_user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      p_order_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    expect(timeout).toHaveBeenCalledExactlyOnceWith(10_000);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.signal).toBe(timeout.mock.results[0].value);
    expect(new Headers(init?.headers).get('x-retry-count')).toBeNull();
  });

  // A2 catches lossy bigint conversion, wrong projection, and leaked quote/authority fields.
  it('maps exact FOUND to ProviderChargeBinding without quote fields', async () => {
    expect(await source().getProviderBinding(ACTOR, ORDER)).toEqual({
      orderId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      contextId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', provider: 'PAYPAL', environment: 'SANDBOX',
      billingCountry: 'US', scope: { account_id: 'Account_1.a:-', merchant_id: 'Merchant_2.b:-' },
      bindingId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', bindingVersion: '9007199254740993',
      bindingHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      credentialRef: 'Paypal_1.ref-', expectedPayPalClientId: 'Client_3.c:-',
    });
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // A3 catches collapsing refusal outcomes into FOUND, NOT_FOUND, or an error.
  it.each([
    ['NOT_FOUND', { kind: 'NOT_FOUND' }],
    ['CONTEXT_REQUIRED', { kind: 'CONTEXT_REQUIRED' }],
    ['VERIFICATION_BINDING_REQUIRED', { kind: 'VERIFICATION_BINDING_REQUIRED' }],
  ])('maps exact non-FOUND %s', async (outcome, expected) => {
    wire = { contract_version: 'web-payment-provider-binding.v1', outcome, charge_authority: false };
    expect(await source().getProviderBinding(ACTOR, ORDER)).toEqual(expected);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // A4: each row catches omission of the named field constraint.
  // PORTONE uses its alternative provider metadata; all other rows change one field only.
  it.each<[string, Record<string, unknown>]>([
    ['PORTONE with native alternative metadata', { provider: 'PORTONE', scope: {
      merchant_id: 'Merchant', store_id: 'Store', channel_id: 'Channel', channel_type: 'SANDBOX',
    }, expected_application: null }],
    ['provider PORTONE only', { provider: 'PORTONE' }],
    ['provider lowercase only', { provider: 'paypal' }],
    ['environment TEST', { environment: 'TEST' }],
    ['environment lowercase', { environment: 'sandbox' }],
    ['order_id mismatch', { order_id: '11111111-1111-4111-8111-111111111111' }],
    ['order_id non-UUID', { order_id: 'Q7pPriv' }],
    ['context_id non-UUID', { context_id: 'Q7pPriv' }],
    ['context_id uppercase', { context_id: 'CCCCCCCC-CCCC-4CCC-8CCC-CCCCCCCCCCCC' }],
    ['quote_id non-UUID even though discarded', { quote_id: 'Q7pPriv' }],
    ['binding_id non-UUID', { binding_id: 'Q7pPriv' }],
    ['quote_hash nonhex even though discarded', { quote_hash: 'Q7pPriv' }],
    ['quote_hash uppercase', { quote_hash: 'A'.repeat(64) }],
    ['quote_hash 63 chars', { quote_hash: 'a'.repeat(63) }],
    ['quote_hash 65 chars', { quote_hash: 'a'.repeat(65) }],
    ['binding_hash nonhex', { binding_hash: 'Q7pPriv' }],
    ['binding_hash uppercase', { binding_hash: 'B'.repeat(64) }],
    ['binding_hash trailing newline', { binding_hash: 'b'.repeat(64) + '\n' }],
    ['billing_country lowercase', { billing_country: 'us' }],
    ['billing_country 3 chars', { billing_country: 'USA' }],
    ['billing_country trailing newline', { billing_country: 'US\n' }],
    ['scope null', { scope: null }],
    ['scope array', { scope: [] }],
    ['scope extra key', { scope: { ...FOUND.scope, secret: 'Q7pPriv' } }],
    ['scope missing account', { scope: { merchant_id: 'Merchant_2.b:-' } }],
    ['scope missing merchant', { scope: { account_id: 'Account_1.a:-' } }],
    ['scope empty account', { scope: { ...FOUND.scope, account_id: '' } }],
    ['scope empty merchant', { scope: { ...FOUND.scope, merchant_id: '' } }],
    ['scope numeric account', { scope: { ...FOUND.scope, account_id: 1 } }],
    ['scope invalid merchant char', { scope: { ...FOUND.scope, merchant_id: 'Q7pPriv/' } }],
    ['scope account 201 chars', { scope: { ...FOUND.scope, account_id: 'a'.repeat(201) } }],
    ['scope merchant 201 chars', { scope: { ...FOUND.scope, merchant_id: 'm'.repeat(201) } }],
    ['scope trailing newline', { scope: { ...FOUND.scope, account_id: 'Q7pPriv\n' } }],
    ['binding_version numeric', { binding_version: 1 }],
    ['binding_version zero', { binding_version: '0' }],
    ['binding_version leading zero', { binding_version: '01' }],
    ['binding_version int8 overflow', { binding_version: '9223372036854775808' }],
    ['binding_version negative', { binding_version: '-1' }],
    ['binding_version exponent', { binding_version: '1e2' }],
    ['binding_version 20 digits', { binding_version: '10000000000000000000' }],
    ['binding_version trailing newline', { binding_version: '1\n' }],
    ['credential_ref URL', { credential_ref: 'https://x' }],
    ['credential_ref empty', { credential_ref: '' }],
    ['credential_ref numeric prefix', { credential_ref: '1Paypal' }],
    ['credential_ref 129 chars', { credential_ref: 'P'.repeat(129) }],
    ['credential_ref trailing newline', { credential_ref: 'Q7pPriv\n' }],
    ['expected_application null', { expected_application: null }],
    ['expected_application array', { expected_application: [] }],
    ['expected_application extra key', { expected_application: { paypal_client_id: 'Client_3.c:-', secret: 'Q7pPriv' } }],
    ['expected_application missing client', { expected_application: {} }],
    ['expected_application empty client', { expected_application: { paypal_client_id: '' } }],
    ['expected_application numeric client', { expected_application: { paypal_client_id: 1 } }],
    ['expected_application invalid client char', { expected_application: { paypal_client_id: 'Q7pPriv/' } }],
    ['expected_application 201 char client', { expected_application: { paypal_client_id: 'c'.repeat(201) } }],
    ['expected_application client trailing newline', { expected_application: { paypal_client_id: 'Q7pPriv\n' } }],
    ['top-level extra key', { secret: 'Q7pPriv' }],
    ['charge_authority true', { charge_authority: true }],
    ['charge_authority string', { charge_authority: 'false' }],
    ['contract_version other', { contract_version: 'Q7pPriv' }],
    ['outcome other', { outcome: 'Q7pPriv' }],
  ])('rejects malformed FOUND %s', async (_name, patch) => {
    wire = { ...FOUND, ...patch };
    await expectSafeError(source().getProviderBinding(ACTOR, ORDER), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // Every required key matters, including the validated-then-discarded quote pair.
  it.each([
    'contract_version', 'outcome', 'charge_authority', 'order_id', 'context_id', 'quote_id', 'quote_hash',
    'provider', 'environment', 'billing_country', 'scope', 'binding_id', 'binding_version', 'binding_hash',
    'credential_ref', 'expected_application',
  ])('rejects FOUND missing %s', async key => {
    const data: Record<string, unknown> = { ...FOUND };
    delete data[key]; wire = data;
    await expectSafeError(source().getProviderBinding(ACTOR, ORDER), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // A5 catches permissive native3 parsing, unknown outcomes, and non-object bodies.
  it.each<[string, unknown]>([
    ['NOT_FOUND extra key', { ...NOT_FOUND, secret: 'Q7pPriv' }],
    ['CONTEXT_REQUIRED extra key', { ...NOT_FOUND, outcome: 'CONTEXT_REQUIRED', secret: 'Q7pPriv' }],
    ['VERIFICATION_BINDING_REQUIRED extra key', { ...NOT_FOUND, outcome: 'VERIFICATION_BINDING_REQUIRED', secret: 'Q7pPriv' }],
    ['missing contract_version', { outcome: 'NOT_FOUND', charge_authority: false }],
    ['missing outcome', { contract_version: 'web-payment-provider-binding.v1', charge_authority: false }],
    ['missing charge_authority', { contract_version: 'web-payment-provider-binding.v1', outcome: 'NOT_FOUND' }],
    ['unknown outcome', { ...NOT_FOUND, outcome: 'Q7pPriv' }],
    ['wrong contract_version', { ...NOT_FOUND, contract_version: 'Q7pPriv' }],
    ['charge_authority true', { ...NOT_FOUND, charge_authority: true }],
    ['charge_authority string', { ...NOT_FOUND, charge_authority: 'false' }],
    ['null', null], ['array', []], ['array of DTOs', [NOT_FOUND]], ['string', 'Q7pPriv'], ['number', 1],
  ])('rejects malformed non-FOUND/body %s', async (_name, data) => {
    wire = data;
    await expectSafeError(source().getProviderBinding(ACTOR, ORDER), 'RESPONSE');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // A6 catches raw SDK errors escaping and wrong safe error stages.
  // Pinned postgrest-js never retries POST; the 503 single-call assertion characterizes that behavior.
  // retry(false) is defensive; these assertions do not detect its removal.
  it.each<[number, string, string]>([
    [400, 'P0001', 'WEB_PAYMENT_PROVIDER_BINDING_INVALID'],
    [401, '42501', 'Q7pPriv'], [403, '42501', 'Q7pPriv'], [503, 'Q7pPriv', 'Q7pPriv'],
  ])('closes HTTP %i without retrying or leaking error details', async (httpStatus, code, message) => {
    status = httpStatus;
    wire = { code, message, details: 'Q7pPriv', hint: 'Q7pPriv' };
    await expectSafeError(source().getProviderBinding(ACTOR, ORDER), 'RPC');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['fetch rejection', new Error('Q7pPriv')],
    ['AbortError', new DOMException('Q7pPriv', 'AbortError')],
  ])('closes %s without retrying or leaking the thrown value', async (_name, error) => {
    rpcFetch.mockRejectedValue(error);
    await expectSafeError(source().getProviderBinding(ACTOR, ORDER), 'RPC');
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });

  // Dependency fault injection catches raw synchronous errors escaping our RPC catch.
  it('closes synchronous rpc throw without leaking the thrown value', async () => {
    const client = createClient('https://binding-db.example.invalid', 'synthetic-service-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: rpcFetch },
    });
    vi.spyOn(client, 'rpc').mockImplementation(() => { throw new Error('Q7pPriv'); });
    await expectSafeError(createRpcChargeBindingSource(client).getProviderBinding(ACTOR, ORDER), 'RPC');
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  // A7 catches omitted validation or normalization that turns invalid IDs into authority.
  it.each<[string, unknown, unknown]>([
    ['uppercase actor', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', ORDER],
    ['empty actor', '', ORDER], ['non-UUID actor', 'Q7pPriv', ORDER],
    ['uppercase order', ACTOR, 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB'],
    ['empty order', ACTOR, ''], ['non-UUID order', ACTOR, 'Q7pPriv'],
    ['actor trailing newline', ACTOR + '\n', ORDER], ['order trailing newline', ACTOR, ORDER + '\n'],
    ['null actor', null, ORDER], ['numeric order', ACTOR, 1],
  ])('rejects invalid input %s before fetch', async (_name, actor, order) => {
    await expectSafeError(source().getProviderBinding(actor as string, order as string), 'CONFIG');
    expect(rpcFetch).not.toHaveBeenCalled();
  });

  // Acceptance boundaries catch over-restrictive validation and Number conversion.
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ['LIVE', { environment: 'LIVE' }, { environment: 'LIVE' }],
    ['version minimum', { binding_version: '1' }, { bindingVersion: '1' }],
    ['version int8 maximum', { binding_version: '9223372036854775807' }, { bindingVersion: '9223372036854775807' }],
    ['scope minimum', { scope: { account_id: 'a', merchant_id: 'm' } }, { scope: { account_id: 'a', merchant_id: 'm' } }],
    ['scope maximum', { scope: { account_id: 'a'.repeat(200), merchant_id: 'm'.repeat(200) } },
      { scope: { account_id: 'a'.repeat(200), merchant_id: 'm'.repeat(200) } }],
    ['credential minimum', { credential_ref: 'P' }, { credentialRef: 'P' }],
    ['credential maximum', { credential_ref: 'P'.repeat(128) }, { credentialRef: 'P'.repeat(128) }],
    ['client minimum', { expected_application: { paypal_client_id: 'c' } }, { expectedPayPalClientId: 'c' }],
    ['client maximum', { expected_application: { paypal_client_id: 'c'.repeat(200) } }, { expectedPayPalClientId: 'c'.repeat(200) }],
  ])('accepts valid boundary %s', async (_name, patch, expected) => {
    wire = { ...FOUND, ...patch };
    expect(await source().getProviderBinding(ACTOR, ORDER)).toMatchObject(expected);
    expect(rpcFetch).toHaveBeenCalledTimes(1);
  });
});
