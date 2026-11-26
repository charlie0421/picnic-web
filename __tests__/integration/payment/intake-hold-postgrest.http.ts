/**
 * Disposable H1 intake-hold driver. The root owns the database, the observer connection, the proxy
 * gates and the process lifecycle. This file runs the actual W modules. Only the PayPal fetch and the
 * PayPal credential are synthetic. Every database call passes through the owned proxy to local PostgREST.
 * The driver waits for one root command at a time and holds no result that the root did not request.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createWebPaymentChargeRepository } from '../../../lib/payment/paypal-charge/repository';
import { createRpcChargeBindingSource } from '../../../lib/payment/paypal-charge/binding-source';
import { createRpcProviderEntryGate } from '../../../lib/payment/paypal-charge/provider-entry';
import { capturePayPalOrder, ensurePayPalProviderOrder, getPayPalChargeStatus, reconcilePayPalOrder,
  type PayPalChargeDeps } from '../../../lib/payment/paypal-charge/orchestrator';
import { createPayPalFetchTransport } from '../../../lib/payment/paypal-charge/transport';
import { createReconciliationRepository } from '../../../lib/payment/paypal-charge/reconciliation-repository';
import { runPayPalReconciliationBatch } from '../../../lib/payment/paypal-charge/reconciliation-executor';

const guard = require('/fixture/guard.cjs');
const config = JSON.parse(fs.readFileSync('/fixture/config.json', 'utf8'));
const phase = process.argv[2];
const role = process.argv[3];
assert.ok(['canonical', 'fault'].includes(phase) && phase === config.phase, 'Phase differs from the owned configuration');
assert.ok(typeof role === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(role), 'Invalid process role');
const sha = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');
const executionPins = { bundleSha256: sha(fs.readFileSync('/fixture/intake-hold-http.cjs')),
  guardSha256: sha(fs.readFileSync('/fixture/guard.cjs')), entryDeliverySha256: config.executionPins.entryDeliverySha256 };

// Process identity for the root: PID plus the kernel start time of this process.
const stat = fs.readFileSync('/proc/self/stat', 'utf8');
const startTicks = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[19];
const bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
guard.emit({ type: 'hello', role, pid: process.pid, startId: `boot:${bootId}:start:${startTicks}`, phase, memory: guard.memory() });

const PAYPAL_HOST = 'api-m.sandbox.paypal.com';
const P1 = 'record_web_payment_submission_result';
const COMPLETE = 'complete_web_payment_read_cycle';
const NO_DATA_COMPLETION = { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'NO_DATA',
  category: 'READ_TRANSPORT_UNKNOWN', get_http_status: null, get_body_status: null, observed_capture_ids: null,
  unparseable_capture_count: 0, capture_count_exceeded: false, facts: [], assertions: [], receive_fact_index: null };
const INVALID_COMPLETION = { contract_version: 'web-payment-read-cycle-completion.v2', kind: 'H1_INVALID_KIND' };

type ProviderSpec = { transport?: 'UNKNOWN'; http?: number; json?: unknown; order?: string; intent?: string; amount?: string;
  captures?: Array<{ v: string; status: string }>; captureCount?: number; captureShape?: 'object'; omit?: string[] };
type Step = { id: number; case: string; sub: string | null; order: string; actor: string; action: string; scope: string;
  provider: { create?: ProviderSpec; capture?: ProviderSpec; gets?: ProviderSpec[]; getDefault?: ProviderSpec };
  gates: unknown[]; shape?: unknown[]; invalid?: boolean };

const hexOrder = (order: string) => order.replaceAll('-', '').toUpperCase();
const providerOrderId = (order: string) => 'H1O' + hexOrder(order).slice(0, 30);
const captureId = (order: string, variant: string) => 'H1C' + variant + hexOrder(order).slice(0, 28);

// Synthetic provider response for one order. Amount, currency, merchant and identities match the seeded
// binding unless the root asks for one specific difference, so an unrelated mismatch cannot hold an order.
function orderBody(order: string, spec: ProviderSpec) {
  const amount = spec.amount ?? '1.23';
  const money = () => ({ value: amount, currency_code: 'USD' });
  const captures = spec.captureCount !== undefined
    ? Array.from({ length: spec.captureCount }, (_unused, index) => ({ id: captureId(order, 'N' + String(index).padStart(2, '0')),
      status: 'COMPLETED', amount: money() }))
    : (spec.captures ?? []).map(capture => ({ id: captureId(order, capture.v), status: capture.status, amount: money() }));
  const unit: Record<string, unknown> = { custom_id: `v2:${order}`, amount: money(),
    payee: { merchant_id: 'binding-merchant-v1' }, payments: { captures: spec.captureShape === 'object' ? {} : captures } };
  for (const key of spec.omit ?? []) delete unit[key];
  return { id: providerOrderId(order), status: spec.order, intent: spec.intent ?? 'CAPTURE', purchase_units: [unit] };
}

let init: any = null;
let current: Step | null = null;
let gets: ProviderSpec[] = [];
let proxyUrl = '';
let repository: ReturnType<typeof createWebPaymentChargeRepository>;
let bindings: ReturnType<typeof createRpcChargeBindingSource>;
let entry: ReturnType<typeof createRpcProviderEntryGate>;
let queue: ReturnType<typeof createReconciliationRepository>;
// Provider order ID to order ID for the orders that a scanner run claimed. It is filled from the queue claim only.
const scanOrders = new Map<string, string>();

// Test-owned PayPal fetch. It never opens a socket. Any other destination is reported and refused.
const paypalFetch: typeof fetch = async (target, requestInit) => {
  const url = new URL(typeof target === 'string' || target instanceof URL ? target : target.url);
  const method = String(requestInit?.method ?? 'GET').toUpperCase();
  const step = current;
  const refuse = (reason: string): never => {
    guard.emit({ type: 'unexpected-request', reason, destination: url.host + url.pathname, method });
    throw new Error('H1_PROVIDER_REQUEST_REFUSED');
  };
  if (!step || url.protocol !== 'https:' || url.host !== PAYPAL_HOST || url.search) return refuse('provider-destination');
  const headers = new Headers(requestInit?.headers);
  const event = (operation: string, spec: ProviderSpec | null, providerOrder: string | null) => guard.emit({ type: 'provider',
    step: step.id, method, operation, providerOrderId: providerOrder, status: spec === null ? 200 : spec.transport ? null : spec.http ?? null });
  const reply = (spec: ProviderSpec, order: string) => {
    if (spec.transport === 'UNKNOWN') throw new Error('H1_SYNTHETIC_TRANSPORT_FAILURE');
    const payload = spec.json !== undefined ? spec.json : orderBody(order, spec);
    return new Response(JSON.stringify(payload), { status: spec.http ?? 200, headers: { 'content-type': 'application/json' } });
  };
  if (url.pathname === '/v1/oauth2/token' && method === 'POST') {
    event('TOKEN', null, null);
    return new Response(JSON.stringify({ token_type: 'Bearer', access_token: init.synthetic.paypalAccessToken }),
      { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (headers.get('authorization') !== `Bearer ${init.synthetic.paypalAccessToken}`) return refuse('provider-credential');
  if (url.pathname === '/v2/checkout/orders' && method === 'POST') {
    const spec = step.provider.create; if (!spec) return refuse('provider-create');
    event('CREATE', spec, providerOrderId(step.order));
    return reply(spec, step.order);
  }
  const match = /^\/v2\/checkout\/orders\/([A-Z0-9]{1,36})(\/capture)?$/.exec(url.pathname);
  if (!match) return refuse('provider-path');
  // A scanner run reads the order that the queue claim returned. Other steps read only their own order.
  const order = step.action === 'scan' ? scanOrders.get(match[1]) : match[1] === providerOrderId(step.order) ? step.order : undefined;
  if (!order) return refuse('provider-order');
  if (match[2] && method === 'POST') {
    const spec = step.provider.capture; if (!spec) return refuse('provider-capture');
    event('CAPTURE', spec, match[1]);
    return reply(spec, order);
  }
  if (!match[2] && method === 'GET') {
    const spec = gets.shift() ?? step.provider.getDefault; if (!spec) return refuse('provider-read');
    event('ORDER_READ', spec, match[1]);
    return reply(spec, order);
  }
  return refuse('provider-method');
};

function dependencies(): PayPalChargeDeps {
  return { repository, bindings, entry, transport: createPayPalFetchTransport(paypalFetch), nowMs: Date.now, log: () => {},
    credentials: { async resolve(value) {
      if (value.provider !== 'PAYPAL' || value.environment !== 'SANDBOX' || value.credentialRef !== init.binding.credentialRef
        || value.bindingVersion !== init.binding.bindingVersion) return null;
      return { clientId: init.binding.clientId, clientSecret: init.synthetic.paypalClientSecret };
    } } };
}

// A raw replay through the same proxy and service credential. The stored body never leaves this process.
async function rawRpc(name: string, body: string) {
  const response = await fetch(`${proxyUrl}/rest/v1/rpc/${name}`, { method: 'POST', body, headers: {
    apikey: init.tokens.service, authorization: `Bearer ${init.tokens.service}`, 'content-type': 'application/json' } });
  const text = await response.text();
  let value: any = null;
  try { value = JSON.parse(text); } catch { /* The status alone is reported. */ }
  return { kind: value?.outcome ?? null, replayed: value?.replayed ?? null, effectiveKind: value?.effective_kind ?? null,
    httpStatus: response.status };
}
function stored(order: string, name: string): any {
  const body = guard.lastRequest(order, name);
  assert.ok(typeof body === 'string', 'This process holds no earlier request for the replay');
  return JSON.parse(body);
}

async function runStep(step: Step) {
  const input = { actorUserId: step.actor, orderId: step.order };
  const d = dependencies();
  switch (step.action) {
    case 'setup': return ensurePayPalProviderOrder(d, input);
    case 'capture': return capturePayPalOrder(d, { ...input, approvedProviderOrderId: providerOrderId(step.order) });
    case 'reconcile': return reconcilePayPalOrder(d, input);
    case 'status': return getPayPalChargeStatus({ repository }, input);
    case 'replay-p1': return rawRpc(P1, guard.lastRequest(step.order, P1) ?? assert.fail('No stored P1 request'));
    case 'conflict-complete': return rawRpc(COMPLETE, JSON.stringify({ ...stored(step.order, COMPLETE), p_completion: NO_DATA_COMPLETION }));
    case 'late-complete': {
      const original = stored(step.order, COMPLETE);
      return rawRpc(COMPLETE, JSON.stringify(step.invalid ? { ...original, p_completion: INVALID_COMPLETION } : original));
    }
    case 'scan': {
      // The actual W3 executor. It sends no claim of a charge, no intent, no CREATE and no capture POST.
      const claimedOrders: string[] = [];
      const summary = await runPayPalReconciliationBatch({ queue, nowMs: Date.now, log: () => {},
        chargeDeps: item => {
          claimedOrders.push(item.orderId);
          scanOrders.set(providerOrderId(item.orderId), item.orderId);
          const { runtime: _runtime, ...rest } = d;
          return rest;
        } }, { executorId: crypto.randomUUID(), runId: crypto.randomUUID(), instanceId: `h1-${role}`, maxItems: 25,
        signal: new AbortController().signal });
      return { kind: 'SCAN', started: summary.started, finished: summary.finished, resultCode: summary.resultCode,
        metrics: summary.metrics, claimedOrders };
    }
    default: throw new Error('H1_UNKNOWN_ACTION');
  }
}

let busy = false;
guard.onCommand((message: any) => {
  void (async () => {
    if (message.op === 'init') {
      assert.equal(init, null, 'Second init');
      assert.deepEqual(executionPins, message.executionPins, 'Execution pins differ');
      init = message;
      proxyUrl = await guard.startProxy(init.tokens.service);
      const client = createClient(proxyUrl, init.tokens.service, { auth: { persistSession: false, autoRefreshToken: false,
        detectSessionInUrl: false } });
      repository = createWebPaymentChargeRepository(client);
      bindings = createRpcChargeBindingSource(client);
      entry = createRpcProviderEntryGate(client);
      queue = createReconciliationRepository(client);
      guard.emit({ type: 'ready', role, executionPins, guard: guard.report().configured });
      return;
    }
    if (message.op === 'exit') {
      await guard.close();
      process.exit(0);
    }
    assert.ok(message.op === 'step' && init !== null && !busy, 'Unexpected root command');
    busy = true;
    const step = message as Step;
    current = step;
    gets = [...(step.provider.gets ?? [])];
    // shape is used only by the two crafted native acceptance probes. The root-owned proxy applies it.
    guard.beginStep({ id: step.id, order: step.order, gates: step.gates, shape: step.shape ?? [] });
    let outcome: unknown = null; let failure: { name: string; code: string } | null = null;
    try { outcome = await runStep(step); }
    catch (error) {
      // Only a fixed code leaves the process. The error text can hold request data.
      failure = { name: error instanceof Error ? error.name : 'Error',
        code: error instanceof Error && /^H1_[A-Z_]+$/.test(error.message) ? error.message : 'H1_STEP_FAILED' };
    }
    guard.endStep();
    current = null; busy = false;
    guard.emit({ type: 'step-done', step: step.id, outcome, error: failure, unusedReads: gets.length, memory: guard.memory() });
  })().catch(() => {
    guard.emit({ type: 'fatal', reason: 'DRIVER_COMMAND_FAILED' });
    process.exit(1);
  });
});
