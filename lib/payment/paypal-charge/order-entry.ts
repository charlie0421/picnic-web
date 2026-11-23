import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

import { isServerOrderUuid } from '@/lib/payment/server-order';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logSafeError, logSafeWarn } from '@/utils/log-safe-error';
import { createRpcChargeBindingSource } from './binding-source';
import {
  capturePayPalOrder, closedPayPalCredentialResolver, ensurePayPalProviderOrder, getPayPalChargeStatus,
  reconcilePayPalOrder, toPayPalChargeBrowserDto, type PayPalChargeDeps, type PayPalChargeOutcome,
} from './orchestrator';
import { createRpcProviderEntryGate } from './provider-entry';
import { createWebPaymentChargeRepository } from './repository';
import { createPayPalFetchTransport } from './transport';

type Action = 'provider-order' | 'capture' | 'reconcile' | 'status';
type OrderInput = { actorUserId: string; orderId: string };

const authRejectionStatuses = new Set([400, 401, 403]);
const outcomeStatuses: Partial<Record<PayPalChargeOutcome['kind'], number>> = {
  BLOCKED: 409, NOT_FOUND: 404, UNAVAILABLE: 503,
};

function respond(body: object, status = 200): Response {
  return Response.json(body, {
    status, headers: { 'Cache-Control': 'private, no-store, max-age=0', Vary: 'Cookie, Authorization' },
  });
}

function allowedOrigin(request: NextRequest, post: boolean): boolean {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') return false;
  return origin === request.nextUrl.origin || (!post && origin === null);
}

async function readJsonText(request: NextRequest): Promise<string | null> {
  const media = request.headers.get('content-type');
  if (!media || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(media)
    || request.headers.has('content-encoding') || !request.body) return null;

  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return text + decoder.decode();
      bytes += value.byteLength;
      if (bytes > 4096) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    void reader.cancel().catch(() => undefined);
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function postInput(request: NextRequest, action: Action): Promise<{ approved: string } | null> {
  const text = await readJsonText(request);
  if (text === null) return null;
  // Match the exact wire shape so duplicate keys and escapes cannot change which ID is approved.
  if (action !== 'capture') return /^[ \t\r\n]*\{[ \t\r\n]*\}[ \t\r\n]*$/.test(text) ? { approved: '' } : null;
  const id = /^[ \t\r\n]*\{[ \t\r\n]*"approvedProviderOrderId"[ \t\r\n]*:[ \t\r\n]*"([A-Z0-9]{1,36})"[ \t\r\n]*\}[ \t\r\n]*$/.exec(text)?.[1];
  return id ? { approved: id } : null;
}

function uuid(value: unknown): value is string {
  return isServerOrderUuid(value) && value.length === 36;
}

function dependencies(): PayPalChargeDeps {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('WEB_PAYMENT_CHARGE_CONFIGURATION');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (target, init) => fetch(target, { ...init, cache: 'no-store' }) },
  });
  return {
    repository: createWebPaymentChargeRepository(client),
    bindings: createRpcChargeBindingSource(client),
    entry: createRpcProviderEntryGate(client),
    credentials: closedPayPalCredentialResolver,
    transport: createPayPalFetchTransport((target, init) => fetch(target, init)),
    nowMs: Date.now,
    log: ({ level, code, orderId, httpStatus }) => {
      const log = level === 'error' ? logSafeError : logSafeWarn;
      log(code, new Error(code), { orderId, httpStatus });
    },
  };
}

function execute(action: Action, deps: PayPalChargeDeps, input: OrderInput, approved: string): Promise<PayPalChargeOutcome> {
  switch (action) {
    case 'provider-order': return ensurePayPalProviderOrder(deps, input);
    case 'capture': return capturePayPalOrder(deps, { ...input, approvedProviderOrderId: approved });
    case 'reconcile': return reconcilePayPalOrder(deps, input);
    case 'status': return getPayPalChargeStatus(deps, input);
  }
}

export function createPayPalOrderHandler(action: Action) {
  const post = action !== 'status';
  return async (request: NextRequest, context: { params: Promise<{ orderId: string }> }): Promise<Response> => {
    let id: string | undefined;
    try {
      if (!allowedOrigin(request, post)) return respond({ error: 'WEB_PAYMENT_NOT_AVAILABLE' }, 403);
      const { orderId } = await context.params;
      if (!uuid(orderId) || request.nextUrl.search) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);
      id = orderId.toLowerCase();
      const input = post ? await postInput(request, action) : { approved: '' };
      if (!input) return respond({ error: 'INVALID_WEB_PAYMENT_ORDER' }, 400);

      const session = await createSupabaseServerClient();
      const { data, error } = await session.auth.getUser();
      if (error) {
        if (error.status && authRejectionStatuses.has(error.status)) {
          return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
        }
        throw new Error('WEB_PAYMENT_CHARGE_AUTH');
      }
      if (!data.user) return respond({ error: 'AUTHENTICATION_REQUIRED' }, 401);
      if (!uuid(data.user.id)) throw new Error('WEB_PAYMENT_CHARGE_AUTH');
      const outcome = await execute(action, dependencies(), { actorUserId: data.user.id.toLowerCase(), orderId: id }, input.approved);
      return respond(toPayPalChargeBrowserDto(id, outcome), outcomeStatuses[outcome.kind]);
    } catch {
      logSafeError('payment.paypal.charge.context.failed', new Error('WEB_PAYMENT_CHARGE_UNAVAILABLE'), { orderId: id });
      return respond(id ? toPayPalChargeBrowserDto(id, { kind: 'UNAVAILABLE', stage: 'CONTEXT' })
        : { error: 'WEB_PAYMENT_ORDER_UNAVAILABLE' }, 503);
    }
  };
}
