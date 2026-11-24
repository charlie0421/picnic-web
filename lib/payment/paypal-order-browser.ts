import { isServerOrderUuid, type ServerOrderRequest } from './server-order';
import type { PayPalChargeBrowserDto } from './paypal-charge/orchestrator';

export type PayPalQuoteInput = Omit<ServerOrderRequest, 'provider'>;
export type PayPalQuote = {
  orderId: string;
  environment: 'LIVE' | 'SANDBOX';
  productName: string;
  amountMinor: string;
  expiresAt: string;
};
type Action = 'provider-order' | 'capture' | 'reconcile' | 'status';
type OrderApi = (action: Action, approvedProviderOrderId?: string) => Promise<PayPalChargeBrowserDto>;
type OrderUpdate = (outcome: PayPalChargeBrowserDto | null) => void;

const cache = 'no-store' as const;
const jsonHeaders = { 'Content-Type': 'application/json' };

export class PayPalQuoteRefused extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

// Only server responses that explicitly reject the request before creating an order.
const refusedQuoteStatuses = new Map([
  ['INVALID_WEB_PAYMENT_ORDER', 400],
  ['ACCOUNT_UNAVAILABLE', 403],
  ['WEB_PAYMENT_NOT_AVAILABLE', 403],
  ['AUTHENTICATION_REQUIRED', 401],
  ['WEB_PAYMENT_POLICY_CHANGED', 409],
]);

function unavailable(): Error {
  return new Error('WEB_PAYPAL_ORDER_UNAVAILABLE');
}

export async function createQuotedPayPalOrder(
  input: PayPalQuoteInput,
  environment: 'LIVE' | 'SANDBOX',
  fetcher: typeof fetch = fetch,
): Promise<PayPalQuote> {
  const { productId, billingCountry, requestId, acceptedPolicyVersion } = input;
  const response = await fetcher('/api/payment/orders', {
    method: 'POST', cache, headers: jsonHeaders, signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({ productId, billingCountry, requestId, acceptedPolicyVersion, provider: 'paypal' }),
  });
  const result = await response.json();
  if (!response.ok) {
    if (refusedQuoteStatuses.get(result?.error) === response.status) throw new PayPalQuoteRefused(result.error);
    throw unavailable();
  }
  const quote = result?.quote;
  if (result?.contractVersion !== 'web-payment-order.v1' || !isServerOrderUuid(result.orderId) || result.orderId.length !== 36
    || quote?.environment !== environment || quote.provider !== 'paypal' || quote.currency !== 'USD'
    || quote.productId !== productId || quote.billingCountry !== billingCountry
    || quote.acceptedPolicyVersion !== acceptedPolicyVersion || typeof quote.productName !== 'string'
    || typeof quote.amountMinor !== 'string' || !/^[1-9][0-9]{0,18}$/.test(quote.amountMinor)
    || typeof quote.expiresAt !== 'string' || !Number.isFinite(Date.parse(quote.expiresAt))) throw unavailable();

  return { orderId: result.orderId, environment, productName: quote.productName, amountMinor: quote.amountMinor, expiresAt: quote.expiresAt };
}

export function payPalOrderApi(orderId: string, fetcher: typeof fetch = fetch): OrderApi {
  if (!isServerOrderUuid(orderId) || orderId.length !== 36) throw unavailable();
  return async (action, approvedProviderOrderId) => {
    const path = `/api/payment/orders/${orderId}/paypal/${action}`;
    const response = await fetcher(path, action === 'status' ? { cache, signal: AbortSignal.timeout(10_000) } : {
      cache, method: 'POST', headers: jsonHeaders,
      body: JSON.stringify(action === 'capture' ? { approvedProviderOrderId } : {}),
    });
    const result = await response.json();
    if (result?.contractVersion !== 'web-payment-charge.v1' || result.orderId !== orderId
      || result.newOrderAllowed !== false || typeof result.state !== 'string') throw unavailable();
    return result as PayPalChargeBrowserDto;
  };
}

export function createPayPalOrderActions(api: OrderApi, update: OrderUpdate) {
  let linkedOrder: string | undefined;
  let creating: Promise<string> | undefined;
  let capturing: Promise<void> | undefined;
  let reconciling: Promise<void> | undefined;
  let closed = false;

  function reconcile() {
    reconciling ??= api('reconcile').then(update, () => update(null));
    return reconciling;
  }

  async function cancel() {
    closed = true;
    if (creating) await creating.catch(() => undefined);
    if (capturing) await capturing;
    if (creating) await reconcile();
  }

  return {
    async createOrder() {
      if (closed) throw unavailable();
      creating ??= api('provider-order').then(result => {
        if (result.state !== 'PROVIDER_ORDER_READY' || typeof result.providerOrderId !== 'string' || !result.providerOrderId
          || result.providerOrderId.length > 36 || /[^A-Z0-9]/.test(result.providerOrderId)) throw unavailable();
        linkedOrder = result.providerOrderId;
        return linkedOrder;
      });
      const id = await creating;
      if (closed) throw unavailable();
      return id;
    },
    async approve(approved: string) {
      if (closed || !linkedOrder || approved !== linkedOrder) return cancel();
      capturing ??= api('capture', approved).then(update, reconcile);
      await capturing;
    },
    cancel,
  };
}
