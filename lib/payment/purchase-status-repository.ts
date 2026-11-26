import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';
import type { LogEventCode } from '@/utils/log-event-codes';
import { getReceiptInboxId, isRecord, mapPurchaseStatus, type PaymentStatusDto,
  type PurchaseLookup, type PurchaseReceipt } from './purchase-status';

const STAGE_EVENTS = {
  CONFIG: 'payment.receipt_status.config.failed',
  RECEIPT: 'payment.receipt_status.receipt.failed',
  OUTCOME: 'payment.receipt_status.outcome.failed',
  RESULT: 'payment.receipt_status.result.failed',
} as const satisfies Record<string, LogEventCode>;

export class PurchaseStatusUnavailable extends Error {
  readonly eventCode: LogEventCode;
  constructor(stage: keyof typeof STAGE_EVENTS) {
    super('PURCHASE_STATUS_UNAVAILABLE');
    this.eventCode = STAGE_EVENTS[stage];
  }
}

function createStatusReader(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new PurchaseStatusUnavailable('CONFIG');
  // No user cookies/session: this client can call the two service-only read RPCs.
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

/** The receipt RLS migration must be installed: clients may SELECT, never write inbox bindings. */
export async function readOwnedPurchaseStatus(
  lookup: PurchaseLookup & { actorUserId: string },
  client: SupabaseClient<Database>,
): Promise<PaymentStatusDto | null> {
  const { data, error } = await client.from('receipts')
    // Casting in PostgREST avoids rounding bigint IDs before JSON reaches us.
    .select('id::text,user_id,platform,environment,status,verification_data')
    // Generated bigint types use number; filter keeps the validated decimal string intact.
    .filter('id', 'eq', lookup.receiptId)
    .eq('user_id', lookup.actorUserId)
    .eq('platform', lookup.provider)
    .eq('environment', lookup.environment.toLowerCase())
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle();
  if (error) throw new PurchaseStatusUnavailable('RECEIPT');
  if (!data) return null;
  if (!isRecord(data) || typeof data.status !== 'string') throw new PurchaseStatusUnavailable('RECEIPT');
  // Keep the owner check explicit even for administrator sessions and unexpected responses.
  if (data.user_id !== lookup.actorUserId || data.id !== lookup.receiptId
    || data.platform !== lookup.provider || data.environment !== lookup.environment.toLowerCase()) return null;
  const receipt: PurchaseReceipt = {
    id: lookup.receiptId, user_id: lookup.actorUserId, platform: lookup.provider,
    environment: data.environment, status: data.status, verification_data: data.verification_data,
  };
  const inboxId = getReceiptInboxId(receipt);
  if (!inboxId) return mapPurchaseStatus(receipt, null, null);

  // Only construct the privileged client after the owned immutable binding is proved.
  const reader = createStatusReader();
  const outcome = await reader.rpc('get_purchase_inbox_outcome', { p_inbox_id: inboxId }, { get: true })
    .abortSignal(AbortSignal.timeout(10_000));
  if (outcome.error || !Array.isArray(outcome.data) || outcome.data.length > 1) throw new PurchaseStatusUnavailable('OUTCOME');
  const state = outcome.data[0] ?? null;
  if (state?.status !== 'SUCCEEDED') return mapPurchaseStatus(receipt, state, null);
  const result = await reader.rpc('get_purchase_result_for_inbox', { p_inbox_id: inboxId }, { get: true })
    .abortSignal(AbortSignal.timeout(10_000));
  if (result.error) throw new PurchaseStatusUnavailable('RESULT');
  return mapPurchaseStatus(receipt, state, result.data);
}
