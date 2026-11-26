import 'server-only';
import { Webhook } from '@portone/server-sdk';
import { boundedId, record, type PortOneEnvironment } from '../portone-test/protocol';
import { readPortOneHostedChannels, type HostedChannels } from './config';
import { HOSTED_EVENT_CONTRACT, type HostedEvent, type HostedEventReceipt, type HostedWebhookEventType } from './repository';
import { createPortOneHostedDependencies } from './runtime';

export type HostedSigning = PortOneEnvironment | 'AMBIGUOUS' | null;
type Options = {
  verify: (rawBody: string, headers: Headers, storeId: string) => Promise<HostedSigning>;
  receive: (event: HostedEvent) => Promise<HostedEventReceipt>;
};
const PAYMENT_ID = /^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Transaction.Confirm is an authorization request and is refused before this map. Only non-authorizing types become OTHER.
const EVENT_TYPES: Readonly<Record<string, HostedWebhookEventType>> = {
  'Transaction.Ready': 'TRANSACTION_READY', 'Transaction.PayPending': 'TRANSACTION_PAY_PENDING',
  'Transaction.VirtualAccountIssued': 'TRANSACTION_VIRTUAL_ACCOUNT_ISSUED', 'Transaction.Paid': 'TRANSACTION_PAID',
  'Transaction.Failed': 'TRANSACTION_FAILED', 'Transaction.PartialCancelled': 'TRANSACTION_PARTIAL_CANCELLED',
  'Transaction.Cancelled': 'TRANSACTION_CANCELLED', 'Transaction.CancelPending': 'TRANSACTION_CANCEL_PENDING',
  'Transaction.DisputeCreated': 'OTHER', 'Transaction.DisputeResolved': 'OTHER',
};

function respond(body: object, status: number) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Binds the signing environment to the payload store. Only environments with a hosted channel for that store are
 * candidates, and exactly one environment secret must verify. Two matches are a configuration error, never a guess.
 */
export async function verifyPortOneHostedWebhook(rawBody: string, headers: Headers, storeId: string, options: {
  channels: Pick<HostedChannels, 'environmentsForStore'>; env: Readonly<Record<string, string | undefined>>;
  verify: (secret: string, rawBody: string, headers: Headers) => Promise<unknown>;
} = { channels: readPortOneHostedChannels(), env: process.env,
  verify: (secret, raw, h) => Webhook.verify(secret, raw, Object.fromEntries(h)) }): Promise<HostedSigning> {
  const matched: PortOneEnvironment[] = [];
  for (const environment of options.channels.environmentsForStore(storeId)) {
    const secret = options.env[`PORTONE_HOSTED_WEBHOOK_SECRET__${environment}`];
    if (!secret) continue;
    try { await options.verify(secret, rawBody, headers); matched.push(environment); } catch { /* Not this environment. */ }
  }
  return matched.length === 1 ? matched[0] : matched.length > 1 ? 'AMBIGUOUS' : null;
}

const defaults: Options = {
  verify: (rawBody, headers, storeId) => verifyPortOneHostedWebhook(rawBody, headers, storeId),
  receive: event => createPortOneHostedDependencies().repository.receiveHostedEvent(event),
};

/**
 * Hosted web_ notifications become durable unverified hints. Returns null when the delivery is not a hosted order,
 * so the existing handler keeps its routing. A 2xx means only that the hint is durably handled, never payment proof.
 */
export async function handlePortOneHostedWebhook(rawBody: string, headers: Headers, options: Options = defaults): Promise<Response | null> {
  let body: Record<string, unknown> | null;
  try { body = record(JSON.parse(rawBody)); } catch { return null; }
  const data = record(body?.data);
  const paymentId = data?.paymentId;
  if (!body || !data || typeof paymentId !== 'string' || !paymentId.startsWith('web_')) return null;
  // This manual-confirm flow sends no confirmUrl. A hosted authorization request is always refused, before any ACK.
  if (body.type === 'Transaction.Confirm') return respond({ error: 'WEB_PAYMENT_CONFIRM_REFUSED' }, 409);
  // Without a canonical id and a store there is no environment binding. The existing handler keeps its own checks.
  if (!PAYMENT_ID.test(paymentId) || !boundedId(data.storeId)) return null;
  let environment: HostedSigning;
  try { environment = await options.verify(rawBody, headers, data.storeId); }
  catch { return respond({ error: 'WEB_PAYMENT_NOTIFICATION_UNAVAILABLE' }, 503); }
  if (environment === null) return null;
  if (environment === 'AMBIGUOUS') return respond({ error: 'WEB_PAYMENT_NOTIFICATION_UNAVAILABLE' }, 503);
  const eventType = typeof body.type === 'string' && Object.hasOwn(EVENT_TYPES, body.type) ? EVENT_TYPES[body.type] : null;
  if (!eventType) return respond({ error: 'WEB_PAYMENT_NOTIFICATION_UNAVAILABLE' }, 503);
  const deliveryId = headers.get('webhook-id');
  if (!boundedId(deliveryId)) return respond({ error: 'INVALID_WEB_PAYMENT_NOTIFICATION' }, 400);
  let receipt: HostedEventReceipt;
  try {
    receipt = await options.receive({ contract_version: HOSTED_EVENT_CONTRACT, source: 'WEBHOOK', environment, store_id: data.storeId,
      payment_id: paymentId, delivery_id: deliveryId, event_type: eventType });
  } catch { return respond({ error: 'WEB_PAYMENT_NOTIFICATION_UNAVAILABLE' }, 503); }
  // A local TEST drill can share the store secret; its web_ orders are not hosted orders and keep their own path.
  if (receipt.outcome === 'IGNORED' && receipt.reasonCode === 'UNKNOWN_PAYMENT') return null;
  return respond({ received: true }, 200);
}
