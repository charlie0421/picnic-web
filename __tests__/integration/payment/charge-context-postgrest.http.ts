// Coordinator-run entry; deliberately outside Vitest's *.test.ts collection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const guard = require('/fixture/guard.cjs');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
const executionPins = {
  bundleSha256: createHash('sha256').update(fs.readFileSync('/fixture/charge-context-http.cjs')).digest('hex'),
  guardSha256: createHash('sha256').update(fs.readFileSync('/fixture/guard.cjs')).digest('hex'),
  // Root hashes the actual in-memory entry echoed by the esbuild delivery metadata.
  entryDeliverySha256: config.executionPins.entryDeliverySha256,
};
assert.match(executionPins.entryDeliverySha256, /^[0-9a-f]{64}$/);
assert.deepEqual(executionPins, config.executionPins);
const phase = process.argv[2];
assert.ok(phase === 'A' || phase === 'B');
assert.deepEqual(Object.keys(config.completionMarkers).sort(), ['A', 'B']);
assert.notEqual(config.completionMarkers.A, config.completionMarkers.B);
const nativeBytes = fs.readFileSync(`/fixture/native-${phase}.json`);
assert.equal(createHash('sha256').update(nativeBytes).digest('hex'), process.argv[3]);
const native = JSON.parse(nativeBytes.toString('utf8'));
const getter = 'get_web_payment_charge_context';
const endpoint = `/rpc/${getter}`;
const proxyPath = `/rest/v1${endpoint}`;
const notFound = { contract_version: 'web-payment-charge-context.v1', outcome: 'NOT_FOUND', charge_authority: false };
type Tap = { method: string; path: string; upstreamPath: string; headers: http.IncomingHttpHeaders;
  requestBody: string; status: number; contentType: string | undefined; cacheControl: string | undefined;
  responseBody: string; response: any };
const taps: Tap[] = [], direct: any[] = [], diagnostics: any[] = [], cases: any[] = [];
const readiness: any[] = [], observedDenials: any[] = [], proxyErrors: string[] = [];
let proxy: http.Server | undefined;
let port = 0;
let completed = false;
const keys = ['actor_deleted', 'amount_minor', 'attempt_id', 'charge_authority', 'context_id', 'contract_version',
  'currency', 'environment', 'order_id', 'outcome', 'payment_id', 'payment_state', 'product_id', 'provider',
  'provider_capture_id', 'provider_order_id', 'quantity', 'quote_expires_at', 'quote_hash', 'quote_id',
  'review_required', 'row_version', 'settlement_state', 'submission_intent_recorded', 'verification_binding_present'];
const forbiddenKeys = ['lease_token', 'fencing_version', 'credential_ref', 'binding_hash', 'expected_scope',
  'scope', 'quote', 'settings_snapshot', 'provider_request_key', 'submit_not_after'];
function noForbiddenKeys(value: any): void {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!forbiddenKeys.includes(key), `forbidden internal value: ${key}`);
    noForbiddenKeys(child);
  }
}
function noValueLeaks(value: any): void {
  const text = JSON.stringify(value);
  assert.notEqual(value?.outcome, 'FOUND');
  for (const item of config.cases) {
    if (item.order) assert.ok(!text.includes(item.order), 'order identity leaked');
  }
  for (const envelope of Object.values(native) as any[]) {
    if (!envelope.ok || envelope.value.outcome !== 'FOUND') continue;
    for (const key of ['quote_id', 'quote_hash', 'context_id', 'attempt_id', 'provider_order_id', 'provider_capture_id', 'payment_id', 'product_id', 'amount_minor']) {
      const secret = envelope.value[key];
      if (secret !== null) assert.ok(!text.includes(JSON.stringify(secret)), `order value leaked: ${key}`);
    }
  }
  noForbiddenKeys(value);
}
function found(label: string, data: any): void {
  const requested = config.cases.filter((item: any) => item.label === label);
  assert.equal(requested.length, 1);
  assert.equal(data.order_id, requested[0].order, 'FOUND must belong to the fixture request independently of native output');
  assert.deepEqual(Object.keys(data).sort(), keys);
  assert.equal(data.contract_version, 'web-payment-charge-context.v1');
  assert.equal(data.outcome, 'FOUND'); assert.equal(data.charge_authority, false);
  for (const key of ['amount_minor', 'quantity', 'row_version']) assert.equal(typeof data[key], 'string');
  assert.equal(data.quantity, '1'); assert.equal(data.settlement_state, 'NOT_INTAKE');
  assert.equal(data.row_version, label === 'F3' ? '2' : ['F4', 'F5', 'F9'].includes(label) ? '3' : '1');
  assert.equal(data.payment_state, ['F4', 'F5', 'F9'].includes(label) ? 'SUBMISSION_UNKNOWN' : 'NOT_SUBMITTED');
  assert.equal(data.submission_intent_recorded, ['F4', 'F5', 'F9'].includes(label));
  assert.equal(data.review_required, ['F6', 'F7'].includes(label));
  assert.equal(data.actor_deleted, label === 'F9' && phase === 'B');
  const hasContext = ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9'].includes(label);
  assert.equal(data.verification_binding_present, hasContext);
  assert.equal(data.context_id !== null, hasContext);
  assert.equal(data.attempt_id !== null, ['F3', 'F4', 'F5', 'F9'].includes(label));
  const portone = ['F8', 'F11'].includes(label);
  assert.equal(data.provider, portone ? 'PORTONE' : 'PAYPAL');
  assert.equal(data.environment, portone ? 'TEST' : 'SANDBOX');
  assert.equal(data.currency, portone ? 'KRW' : 'USD');
  assert.equal(data.amount_minor, label === 'F10' ? '9999999999' : label === 'F11' ? '2147483647' : portone ? '1700' : '123');
  assert.equal(data.product_id, ['F10', 'F11'].includes(label) ? 'CTXHTTP2' : 'CTXHTTP1');
  assert.equal(data.provider_capture_id, label === 'F5' ? `CTX-CAPTURE-${data.context_id}` : null);
  assert.equal(data.provider_order_id, hasContext && !portone ? `CTX-ORDER-${data.context_id}` : null);
  assert.equal(data.payment_id, label === 'F8' ? `web_${data.context_id}` : null);
  if (label === 'H1') assert.ok(data.quote_expires_at.startsWith('2026-11-01T01:02:03.123456'), 'historical microseconds lost');
  noForbiddenKeys(data);
}
function validateQuery(url: URL, method: string): void {
  assert.ok(['GET', 'POST'].includes(method));
  assert.equal(url.pathname, proxyPath);
  assert.ok(method !== 'POST' || !url.search);
  const seen = new Set<string>();
  for (const [key, value] of url.searchParams) {
    assert.ok(['p_actor_user_id', 'p_order_id'].includes(key) && !seen.has(key));
    assert.ok(value === 'null' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));
    seen.add(key);
  }
}
function wire(tap: Tap, role: string, method: string, args: any): void {
  assert.equal(tap.method, method);
  const expectedToken = config.tokens[role];
  assert.equal(tap.headers.apikey, expectedToken);
  assert.equal(tap.headers.authorization, `Bearer ${expectedToken}`);
  assert.equal(tap.headers.cookie, undefined); assert.equal(tap.headers['x-retry-count'], undefined);
  const url = new URL(tap.path, 'http://127.0.0.1');
  validateQuery(url, method);
  assert.equal(tap.upstreamPath, endpoint + url.search);
  if (method === 'GET') {
    assert.equal(tap.requestBody, ''); assert.equal(tap.headers['accept-profile'], 'public');
    const expected: Record<string, string> = {};
    for (const [key, value] of Object.entries(args)) if (value !== undefined) expected[key] = String(value);
    assert.deepEqual(Object.fromEntries(url.searchParams), expected);
  } else {
    assert.equal(tap.headers['content-profile'], 'public');
    assert.match(String(tap.headers['content-type']), /^application\/json(?:;|$)/i);
    const body = JSON.parse(tap.requestBody);
    assert.deepEqual(Object.keys(body).sort(), ['p_actor_user_id', 'p_order_id']);
    assert.deepEqual(body, args);
  }
  assert.match(String(tap.contentType), /^application\/json(?:;|$)/i);
  // cache-control is retained as raw evidence, without a route no-store claim.
}
async function startProxy(): Promise<void> {
  proxy = http.createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on('data', chunk => chunks.push(Buffer.from(chunk)));
    incoming.on('end', () => {
      try {
        const url = new URL(incoming.url!, 'http://127.0.0.1');
        const method = incoming.method!;
        validateQuery(url, method);
        const body = Buffer.concat(chunks).toString('utf8');
        if (method === 'GET') assert.equal(body, '');
        else assert.deepEqual(Object.keys(JSON.parse(body)).sort(), ['p_actor_user_id', 'p_order_id']);
        const tap: Tap = { method, path: incoming.url!, upstreamPath: endpoint + url.search, headers: incoming.headers,
          requestBody: body, status: 0, contentType: undefined, cacheControl: undefined, responseBody: '', response: null };
        taps.push(tap);
        const headers = { ...incoming.headers, host: `${config.restIp}:3000` };
        const upstream = http.request({ hostname: config.restIp, port: 3000, path: tap.upstreamPath, method, headers }, response => {
          const responseChunks: Buffer[] = [];
          response.on('data', chunk => responseChunks.push(Buffer.from(chunk)));
          response.on('end', () => {
            try {
              tap.status = response.statusCode!; tap.contentType = response.headers['content-type'];
              tap.cacheControl = response.headers['cache-control'];
              tap.responseBody = Buffer.concat(responseChunks).toString('utf8');
              tap.response = JSON.parse(tap.responseBody);
              outgoing.writeHead(tap.status, response.headers); outgoing.end(tap.responseBody);
            } catch (error) { proxyErrors.push(String(error)); outgoing.destroy(error as Error); }
          });
        });
        upstream.setTimeout(5000, () => upstream.destroy(new Error('proxy upstream timeout')));
        upstream.on('error', error => { proxyErrors.push(String(error)); outgoing.destroy(error); });
        upstream.end(body);
      } catch (error) { proxyErrors.push(String(error)); outgoing.destroy(error as Error); }
    });
  });
  await new Promise<void>((resolve, reject) => {
    proxy!.once('error', reject); proxy!.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = proxy.address(); assert.ok(address && typeof address !== 'string');
  port = address.port; guard.allowProxy(port);
}
function rawHeaders(role: string, method: string): Record<string, string> {
  return { apikey: config.tokens[role], Authorization: `Bearer ${config.tokens[role]}`,
    ...(method === 'GET' ? { 'Accept-Profile': 'public' } : { 'Content-Profile': 'public', 'Content-Type': 'application/json' }) };
}
async function raw(role: string, method: string, args: any, timeout: number): Promise<any> {
  const url = new URL(`http://${config.restIp}:3000${endpoint}`);
  if (method === 'GET') for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value));
  const requestHeaders = rawHeaders(role, method);
  assert.equal(requestHeaders.apikey, config.tokens[role]);
  assert.equal(requestHeaders.Authorization, `Bearer ${config.tokens[role]}`);
  assert.ok(!Object.keys(requestHeaders).some(key => ['cookie', 'x-retry-count'].includes(key.toLowerCase())));
  const response = await fetch(url, { method, headers: requestHeaders,
    ...(method === 'POST' ? { body: JSON.stringify(args) } : {}), signal: AbortSignal.timeout(timeout) });
  const body = await response.text();
  return { role, method, url: url.href, requestHeaders, requestBody: method === 'POST' ? JSON.stringify(args) : '',
    requestHeaderEvidence: 'constructed raw-fetch headers; server wire tap applies to proxy SDK calls',
    status: response.status, code: (() => { try { return JSON.parse(body).code ?? null; } catch { return null; } })(),
    contentType: response.headers.get('content-type'), cacheControl: response.headers.get('cache-control'), body, value: JSON.parse(body) };
}
async function ready(): Promise<void> {
  assert.notEqual(config.readinessIdentity.actor, config.readinessIdentity.order);
  assert.ok(!Object.values(config.actors).includes(config.readinessIdentity.actor));
  assert.ok(!config.cases.some((item: any) => item.order === config.readinessIdentity.order));
  const deadline = Date.now() + 23000;
  while (Date.now() < deadline) {
    try {
      const row = await raw('service', 'POST', { p_actor_user_id: config.readinessIdentity.actor,
        p_order_id: config.readinessIdentity.order }, 1000);
      readiness.push(row);
      if (row.status === 200) { assert.deepEqual(row.value, notFound); return; }
    } catch (error) { readiness.push({ error: String(error) }); }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('GETTER_READINESS_REQUIRED_200_EXACT_NOT_FOUND');
}
async function sdk(role: string, method: string, args: any): Promise<{ result: any; tap: Tap }> {
  const client = createClient(`http://127.0.0.1:${port}`, config.tokens[role], {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, db: { schema: 'public' },
  });
  const before = taps.length;
  const result = await client.rpc(getter, args, { get: method === 'GET' }).retry(false).abortSignal(AbortSignal.timeout(5000));
  assert.equal(taps.length, before + 1, 'each SDK call must have exactly one proxy tap');
  const tap = taps[before]; wire(tap, role, method, args);
  assert.equal(result.status, tap.status);
  if (result.error) assert.equal(result.error.code, tap.response.code);
  else assert.deepEqual(result.data, tap.response);
  assert.deepEqual(proxyErrors, []);
  return { result, tap };
}
function nativeMatch(label: string, tap: Tap): void {
  const expected = native[label]; assert.ok(expected, `missing native envelope ${label}`);
  if (expected.ok) {
    assert.equal(tap.status, 200); assert.deepEqual(tap.response, expected.value);
    if (expected.value.outcome === 'NOT_FOUND') { assert.deepEqual(tap.response, notFound); noValueLeaks(tap.response); }
    else found(label, tap.response);
  } else {
    assert.equal(label, 'H2'); assert.equal(tap.status, 400);
    assert.deepEqual(tap.response, { code: 'P0001', details: null, hint: null,
      message: 'WEB_PAYMENT_CHARGE_CONTEXT_BINDING_INVALID' });
    assert.equal(tap.response.code, expected.code); assert.equal(tap.response.message, expected.message);
    noValueLeaks(tap.response);
  }
}
async function denials(): Promise<void> {
  const requests = [
    ['other-rpc', `http://${config.restIp}:3000/rpc/create_web_payment_order`, 'POST'],
    ['table', `http://${config.restIp}:3000/web_payment_orders`, 'GET'],
    ['query-projection', `http://${config.restIp}:3000${endpoint}?select=*`, 'GET'],
    ['query-duplicate', `http://${config.restIp}:3000${endpoint}?p_order_id=null&p_order_id=null`, 'GET'],
    ['query-post', `http://${config.restIp}:3000${endpoint}?p_order_id=null`, 'POST'],
    ['path-suffix', `http://${config.restIp}:3000${endpoint}/`, 'GET'],
    ['method-delete', `http://${config.restIp}:3000${endpoint}`, 'DELETE'],
    ['external-address', `http://192.0.2.1:80${endpoint}`, 'GET'],
    ['shared-port', `http://127.0.0.1:54322${endpoint}`, 'GET'],
    ['topology-alias', `http://${config.restAlias}:3000${endpoint}`, 'GET'],
  ];
  for (const [label, url, method] of requests) {
    let denied = false;
    try { await fetch(url, { method, signal: AbortSignal.timeout(1000) }); }
    catch (error) { denied = String(error).includes('CHARGE_CONTEXT_HTTP_NETWORK_DENIED:'); }
    assert.ok(denied, `guard denial must precede the external operation: ${label}`);
    observedDenials.push({ label, denied });
  }
}
async function run(): Promise<void> {
  await ready(); await startProxy(); await denials();
  for (const item of config.cases.filter((row: any) => !row.label.startsWith('NF_NULL'))) {
    for (const method of ['GET', 'POST']) {
      const args = { p_actor_user_id: item.actor, p_order_id: item.order };
      const { tap } = await sdk('service', method, args);
      nativeMatch(item.label, tap); cases.push({ label: item.label, method, status: tap.status, response: tap.response });
    }
  }
  for (const label of ['NF_NULL_ACTOR', 'NF_NULL_ORDER', 'NF_NULL_BOTH']) {
    const item = config.cases.find((row: any) => row.label === label); assert.ok(item);
    const { tap } = await sdk('service', 'POST', { p_actor_user_id: item.actor, p_order_id: item.order });
    nativeMatch(label, tap); cases.push({ label, method: 'POST', status: tap.status, response: tap.response });
  }
  const own = config.cases.find((row: any) => row.label === 'F2').order;
  for (const role of ['anon', 'authenticated']) for (const method of ['GET', 'POST']) {
    const pair: any[] = [];
    for (const order of [own, config.unknownOrder]) {
      const args = { p_actor_user_id: config.actors.A, p_order_id: order };
      const { tap } = await sdk(role, method, args);
      const expectedStatus = role === 'anon' ? 401 : 403;
      assert.equal(tap.status, expectedStatus); assert.equal(tap.response.code, '42501'); noValueLeaks(tap.response);
      const row = await raw(role, method, args, 5000);
      assert.equal(row.status, expectedStatus); assert.equal(row.value.code, '42501');
      assert.deepEqual(row.value, tap.response); noValueLeaks(row.value); direct.push(row); pair.push(row.value);
    }
    assert.deepEqual(pair[0], pair[1], 'ACL response must not reveal existence');
  }
  const diagnosticArgs = [
    ['null-actor', (order: string) => ({ p_actor_user_id: null, p_order_id: order })],
    ['null-order', (_order: string) => ({ p_actor_user_id: config.actors.A, p_order_id: null })],
    ['null-both', (_order: string) => ({ p_actor_user_id: null, p_order_id: null })],
    ['undefined-actor', (order: string) => ({ p_actor_user_id: undefined, p_order_id: order })],
    ['undefined-order', (_order: string) => ({ p_actor_user_id: config.actors.A, p_order_id: undefined })],
    ['undefined-both', (_order: string) => ({ p_actor_user_id: undefined, p_order_id: undefined })],
  ] as const;
  for (const [label, makeArgs] of diagnosticArgs) {
    const existenceComparison = label === 'null-actor' || label === 'undefined-actor';
    const pair: any[] = [];
    for (const order of [own, config.unknownOrder]) {
      const { tap } = await sdk('service', 'GET', makeArgs(order));
      noValueLeaks(tap.response); pair.push({ status: tap.status, value: tap.response });
      diagnostics.push({ label, path: tap.path, status: tap.status, code: tap.response.code ?? null,
        response: tap.response, existenceComparison,
        comparisonMeaning: existenceComparison ? 'existing versus unknown order argument' : 'identical arguments repeated; no existence comparison',
        expectedObservation: label.startsWith('null') ? '400/22P02' : '404/PGRST202' });
    }
    assert.deepEqual(pair[0], pair[1], existenceComparison
      ? 'GET diagnostic must not reveal existence' : 'identical-input GET diagnostic repeat must be stable');
  }
  assert.equal(taps.length, 53); assert.equal(direct.length, 8); assert.equal(cases.length, 33);
  const expectedPairs = config.cases.flatMap((item: any) =>
    (item.label.startsWith('NF_NULL') ? ['POST'] : ['GET', 'POST']).map(method => `${item.label}:${method}`)).sort();
  assert.deepEqual(cases.map(item => `${item.label}:${item.method}`).sort(), expectedPairs);
  assert.equal(observedDenials.length, 10);
  assert.deepEqual(proxyErrors, []);
  console.log('CHARGE_CONTEXT_HTTP_RESULT ' + JSON.stringify({ phase, cases, taps, direct, diagnostics, readiness,
    readinessIdentity: config.readinessIdentity, observedDenials, observedDenialCount: observedDenials.length, executionPins,
    guard: guard.report(), counts: { proxy: taps.length, direct: direct.length, cases: cases.length },
    limits: 'sequential pool1; public synthetic JWTs; no GoTrue/Kong/provider/UI/capture transmission/FULL claim; retry(false) configured, one tap/no X-Retry-Count observed only for non-retry-eligible responses, GET503/520/network retry suppression unmeasured; readiness23s/watchdog24s fail closed without availability guarantee' }));
  console.log(config.completionMarkers[phase]); completed = true;
}
const watchdog = setTimeout(() => {
  console.log('CHARGE_CONTEXT_HTTP_PARTIAL_RESULT ' + JSON.stringify({ phase, cases, taps, direct, diagnostics, readiness, observedDenials, guard: guard.report() }));
  console.error('CHARGE_CONTEXT_HTTP_DEADLINE'); process.exit(1);
}, config.nodeDeadlineMs);
run().catch(error => {
  console.log('CHARGE_CONTEXT_HTTP_PARTIAL_RESULT ' + JSON.stringify({ phase, cases, taps, direct, diagnostics, readiness, observedDenials, guard: guard.report() }));
  console.error(error); process.exitCode = 1;
}).finally(async () => {
  clearTimeout(watchdog);
  if (proxy) await new Promise<void>(resolve => proxy!.close(() => resolve()));
  if (!completed) process.exitCode = 1;
});
