import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/supabase';
import type { LogEventCode } from '@/utils/log-event-codes';
import { mapServerOrder, type ServerOrderDto, type ServerOrderRequest } from './server-order';

// Only this new RPC is added to the generated schema at the server boundary.
type OrderDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Database['public']['Functions'] & {
      create_web_payment_order: {
        Args: { p_actor_user_id: string; p_product_id: string; p_provider: string;
          p_billing_country: string; p_request_id: string; p_accepted_policy_version: string };
        Returns: Json;
      };
    };
  };
};

const STAGES = {
  AUTH: 'payment.order.failed', BUSINESS: 'payment.order.business.unavailable',
  CONFIG: 'payment.order.config.failed', RPC: 'payment.order.rpc.failed', RESPONSE: 'payment.order.response.failed',
} as const satisfies Record<string, LogEventCode>;

const BUSINESS_ERRORS = {
  WEB_PAYMENT_USER_DELETED: [403, 'ACCOUNT_UNAVAILABLE'],
  WEB_PAYMENT_COUNTRY_NOT_ALLOWED: [403, 'WEB_PAYMENT_NOT_AVAILABLE'],
  WEB_PAYMENT_USER_NOT_ALLOWED: [403, 'WEB_PAYMENT_NOT_AVAILABLE'],
  WEB_PAYMENT_POLICY_NOT_ACCEPTED: [409, 'WEB_PAYMENT_POLICY_CHANGED'],
  WEB_PAYMENT_PRODUCT_INVALID: [400, 'INVALID_WEB_PAYMENT_ORDER'],
  WEB_PAYMENT_PRODUCT_NOT_ON_SALE: [400, 'INVALID_WEB_PAYMENT_ORDER'],
  WEB_PAYMENT_IDEMPOTENCY_CONFLICT: [409, 'WEB_PAYMENT_REQUEST_CONFLICT'],
  WEB_PAYMENT_ORDERS_CLOSED: [503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
  WEB_PAYMENT_POLICY_UNAVAILABLE: [503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
  WEB_PAYMENT_PROMOTION_POLICY_UNAVAILABLE: [503, 'WEB_PAYMENT_ORDER_UNAVAILABLE'],
} as const;

export class ServerOrderError extends Error {
  readonly eventCode: LogEventCode;

  constructor(stage: keyof typeof STAGES, readonly status = 503, readonly code = 'WEB_PAYMENT_ORDER_UNAVAILABLE') {
    super(code);
    this.eventCode = STAGES[stage];
  }
}

function rpcError(error: { code?: string; message?: string }): ServerOrderError {
  if (error.code === 'P0001' && typeof error.message === 'string'
    && Object.prototype.hasOwnProperty.call(BUSINESS_ERRORS, error.message)) {
    const [status, code] = BUSINESS_ERRORS[error.message as keyof typeof BUSINESS_ERRORS];
    // Exact business closure is expected unavailability, not a transport failure.
    return new ServerOrderError(status === 503 ? 'BUSINESS' : 'RPC', status, code);
  }
  return new ServerOrderError('RPC');
}

export async function createServerOrder(
  input: ServerOrderRequest & { actorUserId: string },
): Promise<ServerOrderDto> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ServerOrderError('CONFIG');
  let client;
  try {
    // No user session, cookies or Authorization header enters the service client.
    client = createClient<OrderDatabase>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (target, init) => fetch(target, { ...init, cache: 'no-store' }) },
    });
  } catch {
    throw new ServerOrderError('CONFIG');
  }
  let response;
  try {
    response = await client.rpc('create_web_payment_order', {
      p_actor_user_id: input.actorUserId, p_product_id: input.productId, p_provider: input.provider.toUpperCase(),
      p_billing_country: input.billingCountry, p_request_id: input.requestId,
      p_accepted_policy_version: input.acceptedPolicyVersion,
    }).abortSignal(AbortSignal.timeout(10_000));
  } catch {
    throw new ServerOrderError('RPC');
  }
  if (response.error) throw rpcError(response.error);
  const dto = mapServerOrder(response.data, input);
  if (!dto) throw new ServerOrderError('RESPONSE');
  return dto;
}
