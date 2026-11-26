/** Disposable D1 measurement. Root owns SQL, native baselines and cleanup. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createRpcChargeBindingSource } from '../../../lib/payment/paypal-charge/binding-source';
import { ChargeRepositoryError } from '../../../lib/payment/paypal-charge/repository';

const guard = require('/fixture/guard.cjs');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
const phase = process.argv[2];
assert.ok(['A', 'B', 'C'].includes(phase), 'D1 phase must be A/B/C');
const hash = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const nativeBytes = fs.readFileSync(`/fixture/native-${phase}.json`);
assert.equal(hash(nativeBytes), process.argv[3], 'Native input pin differs');
const native = JSON.parse(nativeBytes.toString('utf8'));
const nativeA = JSON.parse(fs.readFileSync('/fixture/native-A.json', 'utf8'));
const executionPins = {
  bundleSha256: hash(fs.readFileSync('/fixture/provider-binding-http.cjs')),
  guardSha256: hash(fs.readFileSync('/fixture/guard.cjs')),
  entryDeliverySha256: config.executionPins.entryDeliverySha256,
};
assert.deepEqual(executionPins, config.executionPins, 'Executed artifacts differ');
assert.equal(JSON.stringify(native.B1.value), JSON.stringify(nativeA.B1.value), 'Frozen native B1 JSON bytes changed');
const rpc = 'get_web_payment_provider_binding';
const cases = new Map<string, {label: string; actor: string | null; order: string | null}>(config.cases.map((row: any) => [row.label, row]));
assert.equal(cases.size, 9);
const sourceLabels = ['B1', 'B2', 'B3', 'B4', 'NF_OTHER', 'NF_UNKNOWN'];
const rawLabels = [...sourceLabels, 'NF_NULL_ACTOR', 'NF_NULL_ORDER', 'NF_NULL_BOTH'];
const taps: any[] = [], direct: any[] = [], source: any[] = [];
const retry: Record<string, any> = {};
let server: http.Server | null = null;
let activeCase = '';
function semanticHeaders(headers: Headers) {
  return {accept: headers.get('accept'), prefer: headers.get('prefer'), contentType: headers.get('content-type'),
    contentProfile: headers.get('content-profile'), acceptProfile: headers.get('accept-profile'),
    apikeyMatches: headers.get('apikey') === token('service'),
    authorizationMatches: headers.get('authorization') === `Bearer ${token('service')}`,
    clientInfoVersion: /^supabase-js\/([0-9]+\.[0-9]+\.[0-9]+)(?:;|$)/.exec(headers.get('x-client-info') || '')?.[1] ?? null};
}
function expectedSdkHeaders(method: string) {
  return {accept: null, prefer: null, contentType: method === 'POST' ? 'application/json' : null,
    contentProfile: method === 'POST' ? 'public' : null, acceptProfile: method === 'POST' ? null : 'public',
    apikeyMatches: true, authorizationMatches: true, clientInfoVersion: '2.112.3'};
}
const fetches: Record<string, {count: number; headers: (string | null)[];
  sdkHeaders: ReturnType<typeof semanticHeaders>[]}> = {};
const measuredFetch: typeof fetch = async (target, init) => {
  assert.ok(activeCase, 'SDK fetch has no explicit case identity');
  const headers = new Headers(init?.headers || (target instanceof Request ? target.headers : undefined));
  // Capture SDK input before Node fetch adds transport defaults.
  const sdkHeaders = semanticHeaders(headers);
  assert.deepEqual(sdkHeaders, expectedSdkHeaders(sourceLabels.includes(activeCase) ? 'POST' : 'GET'),
    'SDK semantic request headers differ');
  headers.set('x-fixture-case', activeCase);
  const record = fetches[activeCase] ||= {count: 0, headers: [], sdkHeaders: []};
  record.count += 1;
  record.headers.push(headers.get('x-retry-count'));
  record.sdkHeaders.push(sdkHeaders);
  return fetch(target, {...init, headers});
};
function token(role: string) {
  assert.ok(['service', 'anon', 'authenticated'].includes(role));
  return config.tokens[role];
}
function argsFor(label: string) {
  const row = cases.get(label);
  assert.ok(row, `Unknown independent fixture ${label}`);
  return {p_actor_user_id: row.actor, p_order_id: row.order};
}
function bindingFromNative(value: any) {
  return { orderId: value.order_id, contextId: value.context_id, provider: value.provider,
    environment: value.environment, billingCountry: value.billing_country, scope: value.scope,
    bindingId: value.binding_id, bindingVersion: value.binding_version, bindingHash: value.binding_hash,
    credentialRef: value.credential_ref, expectedPayPalClientId: value.expected_application.paypal_client_id };
}
function wireRequest(url: URL, method: string, bearer: string, body?: string) {
  return new Promise<{status: number; response: any; rawBody: string}>((resolve, reject) => {
    const request = http.request(url, {method, headers: {authorization: `Bearer ${bearer}`,
      accept: 'application/json', 'content-type': 'application/json'}}, response => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 65536) { response.destroy(new Error('Response exceeds fixture bound')); return; }
        chunks.push(Buffer.from(chunk));
      });
      response.on('error', reject);
      response.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        try { resolve({status: response.statusCode!, response: JSON.parse(rawBody), rawBody}); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(10000, () => request.destroy(new Error('HTTP fixture deadline')));
    request.on('error', reject);
    if (body !== undefined) request.write(body);
    request.end();
  });
}
async function startProxy() {
  const proxy = http.createServer((request, response) => {
    void (async () => {
      const label = request.headers['x-fixture-case'];
      assert.equal(typeof label, 'string', 'Proxy case header missing');
      assert.ok(sourceLabels.includes(label as string) || (phase === 'A' && ['R_OFF', 'R_DEF'].includes(label as string)));
      const parsed = new URL(request.url!, 'http://127.0.0.1');
      assert.equal(parsed.pathname, `/rest/v1/rpc/${rpc}`);
      const method = request.method!;
      const retryHeader = typeof request.headers['x-retry-count'] === 'string' ? request.headers['x-retry-count'] : null;
      const attempt = taps.filter(row => row.label === label).length;
      const sdkHeaders = fetches[label as string]?.sdkHeaders[attempt];
      assert.ok(sdkHeaders, 'SDK attempt header evidence missing');
      const incomingHeaders = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach(item => incomingHeaders.append(name, item));
        else if (value !== undefined) incomingHeaders.set(name, value);
      }
      assert.deepEqual(semanticHeaders(incomingHeaders), {...sdkHeaders, accept: sdkHeaders.accept ?? '*/*'},
        'Incoming wire semantic headers differ from SDK input');
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        assert.ok(size <= 4096, 'Proxy request exceeds fixture bound');
        chunks.push(Buffer.from(chunk));
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (label === 'R_OFF' || label === 'R_DEF') {
        assert.equal(method, 'GET');
        assert.equal(body, '');
        assert.deepEqual(Object.fromEntries(parsed.searchParams), argsFor('B1'));
        const value = {code: 'UNIT_RETRY_503', message: 'Synthetic SDK retry observation; no upstream request', details: null, hint: null};
        const rawBody = JSON.stringify(value);
        taps.push({label, method, status: 503, retryHeader, sdkHeaders, injected: true, upstream: false,
          response: value, rawBody, retryAfter: '0'});
        response.writeHead(503, {'content-type': 'application/json', 'retry-after': '0'});
        response.end(rawBody);
        return;
      }
      assert.equal(method, 'POST');
      assert.equal(parsed.search, '');
      assert.deepEqual(JSON.parse(body), argsFor(label as string));
      const upstream = await wireRequest(new URL(`http://${config.restIp}:3000/rpc/${rpc}`), method, token('service'), body);
      taps.push({label, method, status: upstream.status, response: upstream.response, rawBody: upstream.rawBody,
        retryHeader, sdkHeaders, injected: false, upstream: true});
      response.writeHead(upstream.status, {'content-type': 'application/json'});
      response.end(upstream.rawBody);
    })().catch(error => {
      taps.push({proxyError: String(error)});
      if (!response.headersSent) response.writeHead(500, {'content-type': 'application/json'});
      response.end(JSON.stringify({code: 'FIXTURE_PROXY_FAILURE', message: String(error)}));
    });
  });
  await new Promise<void>((resolve, reject) => {
    proxy.once('error', reject);
    proxy.listen({host: '127.0.0.1', port: 0}, resolve);
  });
  const address = proxy.address();
  assert.ok(address && typeof address === 'object');
  guard.allowProxy(address.port);
  server = proxy;
  return `http://127.0.0.1:${address.port}`;
}
async function guardProbes() {
  const probes = [
    `https://${config.restIp}:3000/rpc/${rpc}`,
    `http://order-rest:3000/rpc/${rpc}`,
    `http://${config.restIp}:3000/rpc/create_web_payment_order`,
    `http://127.0.0.1:54322/rpc/${rpc}`,
  ];
  for (const url of probes) {
    await assert.rejects(async () => fetch(url), (error: any) => error.code === 'PROVIDER_RPC_HTTP_NETWORK_DENIED');
  }
  assert.equal(guard.report().blocked.length, probes.length);
}
async function sourceMatrix(client: ReturnType<typeof createClient>) {
  const bindingSource = createRpcChargeBindingSource(client);
  for (const label of sourceLabels) {
    activeCase = label;
    const row = cases.get(label)!;
    assert.equal(typeof row.actor, 'string');
    assert.equal(typeof row.order, 'string');
    let result: any;
    try {
      // All consumer arguments are non-null strings; raw null diagnostics are separate.
      const value = await bindingSource.getProviderBinding(row.actor!, row.order!);
      assert.notEqual(label, 'B4', 'PortOne must reject in the PayPal consumer');
      if (label === 'B1') {
        assert.deepEqual(value, bindingFromNative(nativeA.B1.value));
        assert.equal((value as any).bindingVersion, '1');
      } else {
        const kind = label === 'B2' ? 'CONTEXT_REQUIRED' : label === 'B3' ? 'VERIFICATION_BINDING_REQUIRED' : 'NOT_FOUND';
        assert.deepEqual(value, {kind});
      }
      result = {ok: true, value};
    } catch (error) {
      assert.equal(label, 'B4');
      assert.ok(error instanceof ChargeRepositoryError);
      assert.equal(error.stage, 'RESPONSE');
      result = {ok: false, name: error.constructor.name, stage: error.stage};
    }
    assert.equal(fetches[label]?.count, 1);
    assert.deepEqual(fetches[label].headers, [null]);
    source.push({label, method: 'POST', fetchCount: fetches[label].count, result});
    activeCase = '';
  }
}
async function directMatrix() {
  for (const label of rawLabels) {
    const methods = label.startsWith('NF_NULL') ? ['POST'] : ['POST', 'GET'];
    const observed: any[] = [];
    for (const method of methods) {
      const url = new URL(`http://${config.restIp}:3000/rpc/${rpc}`);
      const args = argsFor(label);
      if (method === 'GET') {
        assert.equal(typeof args.p_actor_user_id, 'string');
        assert.equal(typeof args.p_order_id, 'string');
        url.searchParams.set('p_actor_user_id', args.p_actor_user_id!);
        url.searchParams.set('p_order_id', args.p_order_id!);
      }
      const result = await wireRequest(url, method, token('service'), method === 'POST' ? JSON.stringify(args) : undefined);
      assert.equal(result.status, 200);
      assert.equal(native[label].ok, true);
      assert.deepEqual(result.response, native[label].value);
      if (result.response.outcome === 'FOUND') assert.equal(typeof result.response.binding_version, 'string');
      observed.push(result);
      direct.push({label, role: 'service', method, ...result, retryHeader: null});
    }
    if (observed.length === 2) {
      assert.deepEqual(observed[0].response, observed[1].response, 'Actual GET/POST parity');
      assert.equal(observed[0].rawBody, observed[1].rawBody, 'Actual GET/POST JSON bytes');
    }
  }
  for (const role of ['anon', 'authenticated']) {
    for (const method of ['GET', 'POST']) {
      const url = new URL(`http://${config.restIp}:3000/rpc/${rpc}`);
      const args = argsFor('B1');
      if (method === 'GET') {
        url.searchParams.set('p_actor_user_id', args.p_actor_user_id!);
        url.searchParams.set('p_order_id', args.p_order_id!);
      }
      const result = await wireRequest(url, method, token(role), method === 'POST' ? JSON.stringify(args) : undefined);
      assert.ok(result.status < 200 || result.status >= 300, 'Actual ACL status must be non2xx');
      assert.equal(result.response.code, '42501');
      direct.push({label: 'B1', role, method, ...result, retryHeader: null});
    }
  }
  assert.equal(direct.length, 19);
}
async function retryMatrix(client: ReturnType<typeof createClient>) {
  if (phase !== 'A') return;
  for (const label of ['R_OFF', 'R_DEF']) {
    activeCase = label;
    let query = client.rpc(rpc, argsFor('B1'), {get: true});
    if (label === 'R_OFF') query = query.retry(false);
    const result = await query.abortSignal(AbortSignal.timeout(10000));
    assert.ok(result.error, 'Injected503 must produce an SDK error');
    const attempts = taps.filter(row => row.label === label);
    assert.ok(attempts.length > 0);
    assert.equal(fetches[label].count, attempts.length);
    assert.equal(attempts.filter(row => row.upstream).length, 0);
    assert.deepEqual(attempts.map(row => row.retryHeader), fetches[label].headers);
    if (label === 'R_OFF') {
      assert.equal(fetches[label].count, 1);
      assert.deepEqual(fetches[label].headers, [null]);
    } else {
      assert.deepEqual(fetches[label].headers, [null, ...Array.from({length: attempts.length - 1}, (_, n) => String(n + 1))]);
    }
    retry[label] = {fetchCount: fetches[label].count, tapCount: attempts.length, upstreamCount: 0,
      headers: fetches[label].headers, error: true};
    activeCase = '';
  }
}
const partial = () => ({phase, source, direct, taps, retry, guard: guard.report(), executionPins});
const watchdog = setTimeout(() => {
  console.log('PROVIDER_RPC_HTTP_PARTIAL_RESULT ' + JSON.stringify(partial()));
  console.error('HTTP fixture watchdog exceeded');
  process.exit(1);
}, config.nodeDeadlineMs);
watchdog.unref();
async function main() {
  await guardProbes();
  const proxy = await startProxy();
  const client = createClient(proxy, token('service'), {auth: {persistSession: false, autoRefreshToken: false,
    detectSessionInUrl: false}, global: {fetch: measuredFetch}});
  await sourceMatrix(client);
  await directMatrix();
  await retryMatrix(client);
  const fixed = taps.filter(row => row.label !== 'R_DEF');
  assert.equal(fixed.length, phase === 'A' ? 7 : 6);
  assert.equal(taps.filter(row => row.upstream === true).length, 6);
  assert.equal(source.length, 6);
  assert.equal(direct.filter(row => row.role === 'service').length, 15);
  assert.equal(direct.filter(row => row.role !== 'service').length, 4);
  const result = {...partial(), counts: {source: 6, direct: 19, fixedProxy: fixed.length,
    postgrest: taps.filter(row => row.upstream === true).length + direct.length},
    frozenB1Json: JSON.stringify(native.B1.value),
    retryLimit: 'SDK injection observations only; source-predicted4 is not asserted or counted as PostgREST'};
  assert.equal(result.counts.postgrest, 25);
  assert.deepEqual(guard.report().blocked, ['http', 'http-address', 'rpc-path', 'http-address'],
    'Guard observed traffic beyond the four probes');
  console.log('PROVIDER_RPC_HTTP_RESULT ' + JSON.stringify(result));
  console.log(config.completionMarkers[phase]);
}
void main().catch(error => {
  console.log('PROVIDER_RPC_HTTP_PARTIAL_RESULT ' + JSON.stringify(partial()));
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
}).finally(async () => {
  clearTimeout(watchdog);
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server!.close(() => resolve()));
  }
});
