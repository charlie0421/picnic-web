/** Real route/repository/SupabaseJS/undici/PostgREST; synthetic verified actor.
 * No GoTrue, Kong, provider, credential resolver, UI or deployment coverage.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/payment/orders/route';
import { selectFixtureActor } from '../../../scripts/payment/order-http/auth-fixture';

const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
const guard = require('/fixture/network-guard.cjs');
const A = 'a733bb01-0000-4000-8000-000000000001';
const B = 'a733bb01-0000-4000-8000-000000000002';
const D = 'a733bb01-0000-4000-8000-000000000003';
const requestId = (suffix: number) => 'a733bb02-0000-4000-8000-' + String(suffix).padStart(12, '0');
const args = (suffix: number) => ({ productId: 'HTTPP1', provider: 'paypal', billingCountry: 'US',
  requestId: requestId(suffix), acceptedPolicyVersion: 'fixture-consent-1' });
const taps: any[] = [], direct: any[] = [], cases: any[] = [], warnings: any[] = [];
const errors: any[] = [];
const readiness: any[] = [];
const realWarn = console.warn;
const realError = console.error;
console.warn = (...values: unknown[]) => { warnings.push(values); realWarn(...values); };
console.error = (...values: unknown[]) => { errors.push(values); realError(...values); };
let proxy: http.Server | undefined;

function timestampMicros(value: string) {
  const match = /\.(\d{1,6})(?:Z|[+-]\d\d:\d\d)$/.exec(value);
  return BigInt(Date.parse(value)) * 1000n + BigInt((match?.[1] || '').padEnd(6, '0').slice(3));
}

function safeDto(dto: any) {
  assert.deepEqual(Object.keys(dto).sort(), ['contractVersion', 'orderId', 'quote', 'quoteId', 'replayed']);
  assert.equal(dto.contractVersion, 'web-payment-order.v1');
  assert.deepEqual(Object.keys(dto.quote).sort(), ['acceptedPolicyVersion', 'amountMinor', 'baseStar', 'billingCountry',
    'bonusExpiryPolicyVersion', 'bonusPolicyVersion', 'currency', 'environment', 'expiresAt', 'issuedAt',
    'productBonus', 'productId', 'productName', 'productPolicyVersion', 'promotion', 'provider', 'quantity',
    'refundPolicyVersion', 'termsPolicyVersion'].sort());
  assert.deepEqual(dto.quote.promotion, { state: 'CONDITIONAL', campaignCode: 'CANDY_BOOST_DAY',
    evaluationTimeBasis: 'VERIFIED_PROVIDER_COMPLETED_AT' });
  for (const key of ['amountMinor', 'baseStar', 'productBonus']) assert.match(dto.quote[key], /^(0|[1-9][0-9]*)$/);
  assert.equal(dto.quote.quantity, '1');
  assert.equal(timestampMicros(dto.quote.expiresAt) - timestampMicros(dto.quote.issuedAt), 900000000n);
  const forbidden = /credential|settings_snapshot|settings_hash|quote_hash|request_hash|audience|runtime_inputs|paypal_account|binding_id/;
  assert.equal(forbidden.test(JSON.stringify(dto)), false);
}

async function routeCase(name: string, body: any, actor = A, status = 200, expectedRpc = 1) {
  selectFixtureActor(actor);
  const before = taps.length;
  const response = await POST(new NextRequest('https://fixture.invalid/api/payment/orders', {
    method: 'POST', headers: { Origin: 'https://fixture.invalid', 'Content-Type': 'application/json',
      'Sec-Fetch-Site': 'same-origin', Cookie: 'browser-synthetic=never-forward-this', Authorization: 'Bearer browser-user-token' },
    body: JSON.stringify(body),
  }));
  const payload = await response.json();
  cases.push({ name, status: response.status, payload });
  assert.equal(response.status, status, name + ': ' + JSON.stringify(payload));
  const publicErrors: Record<string, string> = {
    'changed-product-conflict': 'WEB_PAYMENT_REQUEST_CONFLICT', 'country-denied': 'WEB_PAYMENT_NOT_AVAILABLE',
    'policy-changed': 'WEB_PAYMENT_POLICY_CHANGED', 'closed-portone': 'WEB_PAYMENT_ORDER_UNAVAILABLE',
    'deleted-actor': 'ACCOUNT_UNAVAILABLE', 'ended-product': 'INVALID_WEB_PAYMENT_ORDER',
    'missing-product': 'INVALID_WEB_PAYMENT_ORDER', 'forged-actor-body': 'INVALID_WEB_PAYMENT_ORDER',
  };
  if (status !== 200) assert.deepEqual(payload, { error: publicErrors[name] });
  assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(taps.length - before, expectedRpc, name + ': wrong RPC count');
  if (expectedRpc) {
    const tap = taps[before];
    assert.equal(tap.method, 'POST');
    assert.equal(tap.path, '/rest/v1/rpc/create_web_payment_order');
    assert.equal(tap.upstreamPath, '/rpc/create_web_payment_order');
    assert.equal(tap.headers.authorization, 'Bearer ' + config.serviceJwt);
    assert.equal(tap.headers.apikey, config.serviceJwt);
    assert.equal(tap.headers.cookie, undefined);
    assert.deepEqual(Object.keys(tap.rpc).sort(), ['p_actor_user_id', 'p_product_id', 'p_provider',
      'p_billing_country', 'p_request_id', 'p_accepted_policy_version'].sort());
    assert.deepEqual(tap.rpc, { p_actor_user_id: actor, p_product_id: body.productId,
      p_provider: body.provider.toUpperCase(), p_billing_country: body.billingCountry,
      p_request_id: body.requestId, p_accepted_policy_version: body.acceptedPolicyVersion });
    if (status === 200) {
      safeDto(payload);
      assert.equal(payload.orderId, tap.response.order_id);
      assert.equal(payload.quoteId, tap.response.quote_id);
      assert.equal(payload.quote.issuedAt, tap.response.quote.issued_at);
      assert.equal(payload.quote.expiresAt, tap.response.quote.expires_at);
      assert.equal(payload.quote.amountMinor, tap.response.quote.amount_minor);
    } else {
      assert.equal(tap.response.code, 'P0001', name + ': business error did not reach PostgreSQL');
    }
  }
  return payload;
}

async function directRpc(name: string, token: string, actor: string, suffix: number, status: number) {
  const response = await fetch(`http://${config.restIp}:3000/rpc/create_web_payment_order`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, apikey: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_user_id: actor, p_product_id: 'HTTPP1', p_provider: 'PAYPAL', p_billing_country: 'US',
      p_request_id: requestId(suffix), p_accepted_policy_version: 'fixture-consent-1' }),
  });
  const body = await response.json();
  direct.push({ name, status: response.status, body });
  assert.equal(response.status, status, name + ': ' + JSON.stringify(body));
  if (status !== 200) assert.equal(body.code, '42501', name + ': schema-cache lookup is not actual SQL permission refusal');
  else assert.equal(body.replayed, false);
}

async function checkNetworkDenials(proxyPort: number) {
  const literal = await new Promise((resolve, reject) => dns.lookup('127.0.0.1', (error, address, family) =>
    error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(literal, { address: '127.0.0.1', family: 4 });
  const all = await new Promise((resolve, reject) => dns.lookup('127.0.0.1', { all: true, family: 4 }, (error, addresses) =>
    error ? reject(error) : resolve(addresses)));
  assert.deepEqual(all, [{ address: '127.0.0.1', family: 4 }]);
  assert.deepEqual(await dns.promises.lookup(config.restIp), { address: config.restIp, family: 4 });
  assert.deepEqual(await dns.promises.lookup('127.0.0.1', { all: true }), [{ address: '127.0.0.1', family: 4 }]);
  await assert.rejects(dns.promises.lookup('127.0.0.1', { family: 6 }), { code: 'EAI_ADDRFAMILY' });
  const observed: string[] = [];
  for (const [name, action] of [
    ['external-fetch', () => fetch('http://192.0.2.1:80/rpc/create_web_payment_order', { method: 'POST' })],
    ['shared-54322', () => fetch('http://127.0.0.1:54322/rest/v1/rpc/create_web_payment_order', { method: 'POST' })],
    ['other-loopback', () => fetch(`http://127.0.0.1:${proxyPort === 1 ? 2 : 1}/rest/v1/rpc/create_web_payment_order`, { method: 'POST' })],
    ['localhost', () => fetch(`http://localhost:${proxyPort}/rest/v1/rpc/create_web_payment_order`, { method: 'POST' })],
    ['other-loopback-ip', () => fetch(`http://127.0.0.2:${proxyPort}/rest/v1/rpc/create_web_payment_order`, { method: 'POST' })],
    ['arbitrary-table', () => fetch(`http://${config.restIp}:3000/web_payment_orders`, { method: 'POST' })],
    ['other-rpc', () => fetch(`http://${config.restIp}:3000/rpc/grant_verified_purchase`, { method: 'POST' })],
    ['tcp', () => net.connect({ host: '192.0.2.1', port: 80 })],
    ['tls', () => tls.connect({ host: config.restIp, port: 3000 })],
    ['dns', () => dns.lookup('example.invalid', () => undefined)],
    ['dns-other-loopback', () => dns.lookup('127.0.0.2', () => undefined)],
    ['dns-external-literal', () => dns.lookup('8.8.8.8', () => undefined)],
    ['dns-resolve', () => dns.resolve4('127.0.0.1', () => undefined)],
    ['dns-reverse', () => dns.reverse('127.0.0.1', () => undefined)],
    ['udp', () => dgram.createSocket('udp4')],
  ] as const) {
    await assert.rejects(async () => action(), /ORDER_HTTP_NETWORK_DENIED/, name);
    observed.push(name);
  }
  return observed;
}

async function checkExplicitEscapeDenials() {
  const observed: string[] = [];
  // These are post-fix coverage. The pre-fix counterpart uses injected
  // tripwires in test_pair_fixture.py so no resolver/process can start.
  for (const [kind, prototype] of [['callback-resolver', dns.Resolver.prototype],
    ['promise-resolver', dns.promises.Resolver.prototype]] as const) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (!/^(resolve|reverse)/.test(name) || typeof (prototype as any)[name] !== 'function') continue;
      await assert.rejects(async () => (Object.create(prototype) as any)[name]('example.invalid', () => undefined),
        /ORDER_HTTP_NETWORK_DENIED:dns/, kind + ':' + name);
      observed.push(kind + ':' + name);
    }
  }
  const childProcess = require('node:child_process');
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) {
    await assert.rejects(async () => childProcess[name]('/fixture/never-execute', []),
      /ORDER_HTTP_NETWORK_DENIED:child-process/, name);
    observed.push('child-process:' + name);
  }
  const { Worker } = require('node:worker_threads');
  await assert.rejects(async () => new Worker('/fixture/never-execute'), /ORDER_HTTP_NETWORK_DENIED:worker-thread/);
  observed.push('worker-thread');
  return observed;
}

async function main() {
  proxy = http.createServer((incoming, outgoing) => {
    if (incoming.method !== 'POST' || incoming.url !== '/rest/v1/rpc/create_web_payment_order') {
      outgoing.writeHead(403); outgoing.end(); return;
    }
    const chunks: Buffer[] = [];
    incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
    incoming.on('end', () => {
      const body = Buffer.concat(chunks);
      const tap: any = { method: incoming.method, path: incoming.url, upstreamPath: '/rpc/create_web_payment_order',
        headers: incoming.headers, body: body.toString('utf8'), rpc: JSON.parse(body.toString('utf8')) };
      taps.push(tap);
      const upstream = http.request({ hostname: config.restIp, port: 3000, path: tap.upstreamPath,
        method: incoming.method, headers: incoming.headers }, response => {
        outgoing.writeHead(response.statusCode!, response.headers);
        const raw: Buffer[] = [];
        response.on('data', chunk => raw.push(Buffer.from(chunk)));
        response.on('end', () => {
          tap.status = response.statusCode; tap.rawResponse = Buffer.concat(raw).toString('utf8');
          try { tap.response = JSON.parse(tap.rawResponse); } catch { tap.response = null; }
        });
        response.pipe(outgoing);
      });
      upstream.on('error', error => { tap.transportError = String(error); outgoing.destroy(error); });
      upstream.end(body);
    });
  });
  await new Promise<void>((resolve, reject) => { proxy!.once('error', reject); proxy!.listen({ host: '127.0.0.1', port: 0 }, resolve); });
  const port = (proxy.address() as net.AddressInfo).port;
  guard.allowProxy(port);
  process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = config.serviceJwt;
  // Finite schema-cache readiness using only the allowed RPC and an invalid
  // product. P0001 proves SQL execution; a PGRST202/404 does not count.
  const until = Date.now() + Math.min(45000, config.nodeDeadlineMs - 1000);
  let ready = false;
  while (Date.now() < until) {
    try {
      const response = await fetch(`http://${config.restIp}:3000/rpc/create_web_payment_order`, {
        method: 'POST', headers: { Authorization: 'Bearer ' + config.serviceJwt, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_actor_user_id: A, p_product_id: 'NOEXIST', p_provider: 'PAYPAL', p_billing_country: 'US',
          p_request_id: requestId(99), p_accepted_policy_version: 'fixture-consent-1' }), signal: AbortSignal.timeout(1000),
      });
      const body = await response.json();
      readiness.push({ status: response.status, body });
      if (readiness.length > 10) readiness.shift();
      if (response.status === 400 && body.code === 'P0001' && body.message === 'WEB_PAYMENT_PRODUCT_INVALID') { ready = true; break; }
    } catch (error) {
      readiness.push({ error: String(error) });
      if (readiness.length > 10) readiness.shift();
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.equal(ready, true, 'PostgREST schema cache never reached the actual source RPC: ' + JSON.stringify(readiness));
  const blocked = await checkNetworkDenials(port);
  const explicitEscapes = await checkExplicitEscapeDenials();
  const first = await routeCase('normal', args(1));
  assert.equal(first.replayed, false);
  assert.equal(first.quote.amountMinor, '123');
  assert.equal(first.quote.baseStar, '100'); assert.equal(first.quote.productBonus, '7');
  assert.equal(first.quote.environment, 'SANDBOX');
  const replay = await routeCase('same-request-replay', args(1));
  assert.deepEqual(replay, { ...first, replayed: true });
  await routeCase('changed-product-conflict', { ...args(1), productId: 'HTTPP3' }, A, 409);
  const afterConflict = await routeCase('unchanged-after-conflict', args(1));
  assert.deepEqual(afterConflict, replay);
  const otherActor = await routeCase('B-separate-order', args(1), B);
  assert.notEqual(otherActor.orderId, first.orderId);
  const expired = await routeCase('expired-replay', args(4));
  assert.equal(expired.replayed, true);
  assert.equal(expired.orderId, 'a733bb04-0000-4000-8000-000000000004');
  assert.equal(expired.quote.issuedAt, '2000-01-01T00:00:00.123456+00:00');
  assert.ok(Date.parse(expired.quote.expiresAt) < Date.now());
  const maximum = await routeCase('original-numeric-maximum', { ...args(5), productId: 'HTTPP3' });
  assert.equal(maximum.quote.amountMinor, '9999999999');
  assert.equal(maximum.quote.baseStar, '2147483647');
  assert.equal(maximum.quote.productBonus, '2147483647');
  await routeCase('country-denied', { ...args(10), billingCountry: 'KR' }, A, 403);
  await routeCase('policy-changed', { ...args(11), acceptedPolicyVersion: 'outdated' }, A, 409);
  const beforeWarn = warnings.length;
  const beforeError = errors.length;
  await routeCase('closed-portone', { ...args(12), provider: 'portone', billingCountry: 'KR' }, A, 503);
  assert.match(JSON.stringify(warnings.slice(beforeWarn)), /payment\.order\.business\.unavailable/);
  assert.equal(errors.length, beforeError, 'CLOSED business 503 was logged as error');
  await routeCase('deleted-actor', args(13), D, 403);
  await routeCase('ended-product', { ...args(14), productId: 'HTTPP2' }, A, 400);
  await routeCase('missing-product', { ...args(15), productId: 'NOEXIST' }, A, 400);
  await routeCase('forged-actor-body', { ...args(16), actorUserId: B }, A, 400, 0);
  await directRpc('anon-self-actor', config.anonJwt, A, 21, 401);
  await directRpc('anon-other-actor', config.anonJwt, B, 22, 401);
  await directRpc('authenticated-self-actor', config.authenticatedJwt, A, 23, 403);
  await directRpc('authenticated-other-actor', config.authenticatedJwt, B, 24, 403);
  await directRpc('service-allowed', config.serviceJwt, A, 25, 200);
  console.log('ORDER_HTTP_RESULT ' + JSON.stringify({ cases, taps, direct, warnings, errors, readiness, guard: guard.report(), observedDenials: blocked,
    observedExplicitEscapeDenials: explicitEscapes,
    scope: 'Synthetic actor and Auth/Vault/profile/campaign; selected source/current7, prefix-only Kong replacement; no GoTrue/provider/FULL/production coverage',
    numericLimit: 'products.web_price_usd numeric(10,2) limits USD minor units to 9999999999; >2^53 cannot be represented by the source type' }));
  console.log(config.completionMarker);
}

const deadline = setTimeout(() => {
  console.log('ORDER_HTTP_PARTIAL_RESULT ' + JSON.stringify({ cases, taps, direct, warnings, errors, readiness, guard: guard.report() }));
  console.error('ORDER_HTTP_FAILED: Node child deadline exceeded');
  process.exit(124);
}, config.nodeDeadlineMs);
deadline.unref();
main().catch(error => {
  console.log('ORDER_HTTP_PARTIAL_RESULT ' + JSON.stringify({ cases, taps, direct, warnings, errors, readiness, guard: guard.report() }));
  console.error('ORDER_HTTP_FAILED', error); process.exitCode = 1;
}).finally(async () => {
  clearTimeout(deadline);
  console.warn = realWarn;
  console.error = realError;
  if (proxy) await new Promise<void>(resolve => { proxy!.close(() => resolve()); proxy!.closeAllConnections(); });
});
