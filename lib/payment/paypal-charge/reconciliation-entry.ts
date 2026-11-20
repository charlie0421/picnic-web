import 'server-only';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { logSafeError, logSafeWarn } from '@/utils/log-safe-error';
import { createRpcChargeBindingSource } from './binding-source';
import { RECONCILIATION_METRIC_KEYS, type ReadWindow, type ReconciliationMetrics } from './durability-contract';
import { closedPayPalCredentialResolver, type PayPalChargeDeps } from './orchestrator';
import { createRpcProviderEntryGate } from './provider-entry';
import { readSignal } from './read-cycle';
import { runPayPalReconciliationBatch, type ReconciliationExecutorDeps, type ReconciliationLogEntry } from './reconciliation-executor';
import { createReconciliationRepository } from './reconciliation-repository';
import { ChargeRepositoryError, createWebPaymentChargeRepository } from './repository';
import { createPayPalFetchTransport } from './transport';

// W3 closed internal entry and production factory (spec G5, 7/10 section 5; plan section W3).
// The handler authenticates the internal secret before it creates a client or starts a run.
// The caller selects nothing: the request body and the query string are not read.
// Registration of the production secret, deployment and the call schedule are OG2. This module does none of them.

const SECRET_HEADER = 'x-payment-reconciliation-secret';
const SECRET_ENV = 'INTERNAL_PAYMENT_RECONCILIATION_SECRET';
const MAX_ITEMS = 25;
const RUN_FAILED = 'payment.paypal.reconcile.run.failed';
// The provider read window is added to exactly these two read RPCs. Every other RPC, including the prepare
// replay and each write, keeps only its own ten-second client deadline.
const READ_RPC_NAMES = ['get_web_payment_charge_context', 'get_web_payment_provider_binding'];

export type ReconciliationEntryDeps = {
  // The configured internal secret. A missing or empty value is unset.
  secret: () => string | null | undefined;
  // Called once for each accepted invocation, after authentication.
  executorDeps: () => ReconciliationExecutorDeps;
  newId: () => string;
  instanceId: string;
  // Fixed batch limit of the deployment, 1..25. A request cannot change it.
  maxItems: number;
  log: (entry: ReconciliationLogEntry) => void;
};

function respond(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}
// The lengths are compared first. Equal-length values are compared in constant time.
function sameSecret(provided: string | null, configured: string): boolean {
  if (provided === null) return false;
  const left = Buffer.from(provided, 'utf8'); const right = Buffer.from(configured, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
function batchLimit(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_ITEMS, Math.max(1, Math.trunc(value))) : 1;
}
// The public result is the 14 numeric metrics that the run sent with its FINISHED record, and nothing else.
function metricsBody(metrics: ReconciliationMetrics): Record<string, number> {
  return Object.fromEntries(RECONCILIATION_METRIC_KEYS.map(key => [key, metrics[key]]));
}

export function createReconciliationHandler(deps: ReconciliationEntryDeps): (request: Request) => Promise<Response> {
  return async function handleReconciliation(request: Request): Promise<Response> {
    if (request.method !== 'POST') return respond({ error: 'METHOD_NOT_ALLOWED' }, 405);
    let configured: string | null | undefined;
    try { configured = deps.secret(); } catch { configured = null; }
    if (typeof configured !== 'string' || configured.length === 0) return respond({ error: 'RECONCILIATION_UNAVAILABLE' }, 503);
    if (!sameSecret(request.headers.get(SECRET_HEADER), configured)) return respond({ error: 'UNAUTHORIZED' }, 401);
    try {
      const summary = await runPayPalReconciliationBatch(deps.executorDeps(), { executorId: deps.newId(), runId: deps.newId(),
        instanceId: deps.instanceId, maxItems: batchLimit(deps.maxItems), signal: request.signal });
      // A STARTED or FINISHED record with no ACK. The executor logged the failed record.
      if (!summary.started || !summary.finished) return respond({ error: 'RECONCILIATION_UNAVAILABLE' }, 503);
      return respond(metricsBody(summary.metrics), 200);
    } catch {
      try { deps.log({ level: 'error', code: RUN_FAILED, phase: 'STARTED' }); } catch { /* Logging cannot change the response. */ }
      return respond({ error: 'RECONCILIATION_UNAVAILABLE' }, 503);
    }
  };
}

function requestTarget(input: RequestInfo | URL): string {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return `${url.origin}${url.pathname}`;
  } catch { return ''; }
}
function readRpcTargets(supabaseUrl: string): ReadonlySet<string> {
  const base = new URL(supabaseUrl.endsWith('/') ? supabaseUrl : `${supabaseUrl}/`);
  return new Set(READ_RPC_NAMES.map(name => { const url = new URL(`rest/v1/rpc/${name}`, base); return `${url.origin}${url.pathname}`; }));
}
// Client fetch of one invocation. A request to one of the two read RPC paths also gets the run signal and
// min(10 s, remaining read budget). With no window, no read budget or a cancelled run the read is not sent.
// The signal of every other request is unchanged.
function createReadWindowFetch(targets: ReadonlySet<string>, currentWindow: () => ReadWindow | null): typeof fetch {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const base: RequestInit = { ...init, cache: 'no-store' };
    if (!targets.has(requestTarget(input))) return fetch(input, base);
    const window = currentWindow();
    const signal = window ? readSignal(window) : null;
    if (!signal) return Promise.reject(new Error('WEB_PAYMENT_RECONCILIATION_READ_NOT_STARTED'));
    return fetch(input, { ...base, signal: base.signal ? AbortSignal.any([base.signal, signal]) : signal });
  };
}

const logRun: ReconciliationEntryDeps['log'] = entry => { logSafeError(entry.code, new Error(entry.code)); };
const logCharge: PayPalChargeDeps['log'] = entry => {
  const fields = { orderId: entry.orderId, ...(entry.httpStatus === undefined ? {} : { httpStatus: entry.httpStatus }) };
  if (entry.level === 'error') logSafeError(entry.code, new Error(entry.code), fields);
  else logSafeWarn(entry.code, new Error(entry.code), fields);
};

// Dependencies of one accepted invocation: one new service client, and a credential resolver that stays closed.
// No environment value can supply a PayPal credential here, so a run sends no provider request.
function createClosedExecutorDeps(): ReconciliationExecutorDeps {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ChargeRepositoryError('CONFIG');
  // The executor passes the read window of the run with each claimed item.
  let window: ReadWindow | null = null;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: createReadWindowFetch(readRpcTargets(url), () => window) },
  });
  const repository = createWebPaymentChargeRepository(client);
  const bindings = createRpcChargeBindingSource(client);
  const entry = createRpcProviderEntryGate(client);
  const transport = createPayPalFetchTransport((target, init) => fetch(target, init));
  return {
    queue: createReconciliationRepository(client),
    chargeDeps: item => {
      window = item.window;
      return { repository, bindings, credentials: closedPayPalCredentialResolver, transport, entry, nowMs: () => Date.now(), log: logCharge };
    },
    nowMs: () => Date.now(),
    log: logRun,
  };
}

export function createClosedReconciliationDeps(): ReconciliationEntryDeps {
  return {
    secret: () => process.env[SECRET_ENV],
    executorDeps: createClosedExecutorDeps,
    newId: () => randomUUID(),
    // Names this process instance in the run records. It holds no request value.
    instanceId: `paypal-reconciliation:${randomUUID()}`,
    maxItems: MAX_ITEMS,
    log: logRun,
  };
}
