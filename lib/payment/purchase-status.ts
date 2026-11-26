export type PurchaseProvider = 'paypal' | 'portone';
export type PurchaseEnvironment = 'LIVE' | 'SANDBOX';
export type PurchaseLookup = {
  receiptId: string;
  provider: PurchaseProvider;
  environment: PurchaseEnvironment;
};
export type PurchaseReceipt = {
  id: string;
  user_id: string;
  platform: PurchaseProvider;
  environment: string;
  status: string;
  verification_data: unknown;
};
type SettlementState = 'UNKNOWN' | 'QUEUED' | 'PROCESSING' | 'RETRY_WAIT' | 'COMPLETED' | 'REVIEW_REQUIRED';
type PromotionState = 'UNKNOWN' | 'PENDING_TIME' | 'ELIGIBLE' | 'INELIGIBLE' | 'GRANTED' | 'REJECTED' | 'CANCELLED_BY_REFUND';
type SafeReasonCode = 'LEGACY_RECEIPT' | 'PURCHASE_STATE_UNAVAILABLE' | 'PURCHASE_RESULT_UNAVAILABLE'
  | 'RETRY_SCHEDULED' | 'SETTLEMENT_REVIEW_REQUIRED' | null;

export type PaymentStatusDto = {
  contractVersion: 'web-payment.v1';
  orderId: null;
  receiptId: string;
  provider: PurchaseProvider;
  environment: PurchaseEnvironment;
  // These RPCs prove settlement, not the provider's current payment/refund state.
  paymentState: 'UNKNOWN';
  settlementState: SettlementState;
  refundState: 'UNKNOWN';
  promotionState: PromotionState;
  safeReasonCode: SafeReasonCode;
  nextRetryAt: string | null;
  baseRewards: { star: string; bonus: string } | null;
  promotionGross: string | null;
  // Existing purchase results omit debt offsets and net wallet credits.
  totals: null;
  updatedAt: null;
};

const BIGINT_MAX = BigInt('9223372036854775807');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integerString(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= BIGINT_MAX;
}

export function parsePurchaseLookup(receiptId: string, params: URLSearchParams): PurchaseLookup | null {
  if (!integerString(receiptId) || receiptId === '0') return null;
  if (Array.from(params.keys()).some(key => key !== 'provider' && key !== 'environment')) return null;
  if (params.getAll('provider').length !== 1 || params.getAll('environment').length !== 1) return null;
  const provider = params.get('provider');
  const environment = params.get('environment');
  if (provider !== 'paypal' && provider !== 'portone') return null;
  if (environment !== 'LIVE' && environment !== 'SANDBOX') return null;
  // The legacy PortOne intake folds every input environment into LIVE.
  if (provider === 'portone' && environment !== 'LIVE') return null;
  return { receiptId, provider, environment };
}

export function getReceiptInboxId(receipt: PurchaseReceipt): string | null {
  const data = receipt.verification_data;
  return isRecord(data) && data.provider === receipt.platform.toUpperCase()
    && typeof data.inbox_id === 'string' && UUID.test(data.inbox_id) ? data.inbox_id : null;
}

function safeTimestamp(value: unknown): string | null {
  return typeof value === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}

export function mapPurchaseStatus(receipt: PurchaseReceipt, outcome: unknown, result: unknown): PaymentStatusDto {
  const dto: PaymentStatusDto = {
    contractVersion: 'web-payment.v1', orderId: null, receiptId: receipt.id,
    provider: receipt.platform, environment: receipt.environment.toUpperCase() as PurchaseEnvironment,
    paymentState: 'UNKNOWN', settlementState: 'UNKNOWN', refundState: 'UNKNOWN',
    promotionState: 'UNKNOWN', safeReasonCode: 'LEGACY_RECEIPT', nextRetryAt: null,
    baseRewards: null, promotionGross: null, totals: null, updatedAt: null,
  };
  if (!getReceiptInboxId(receipt)) return dto;
  dto.settlementState = 'REVIEW_REQUIRED';
  dto.safeReasonCode = 'PURCHASE_STATE_UNAVAILABLE';
  if (!isRecord(outcome)) return dto;

  switch (outcome.status) {
    case 'PENDING':
      dto.settlementState = typeof outcome.attempt_count === 'number' && outcome.attempt_count > 0
        ? 'RETRY_WAIT' : 'QUEUED';
      break;
    case 'PROCESSING':
      dto.settlementState = outcome.lease_active === true ? 'PROCESSING' : 'RETRY_WAIT';
      break;
    case 'DEAD':
      dto.safeReasonCode = 'SETTLEMENT_REVIEW_REQUIRED';
      return dto;
    case 'SUCCEEDED': {
      dto.safeReasonCode = 'PURCHASE_RESULT_UNAVAILABLE';
      if (!isRecord(result) || result.contract_version !== 'wallet.v1'
        || typeof result.operation_id !== 'string' || !UUID.test(result.operation_id)
        || !integerString(result.base_star_amount) || !integerString(result.base_bonus_amount)) return dto;
      dto.settlementState = 'COMPLETED';
      dto.baseRewards = { star: result.base_star_amount, bonus: result.base_bonus_amount };
      const promo = result.promotion;
      if (isRecord(promo)) {
        const states: PromotionState[] = ['PENDING_TIME', 'ELIGIBLE', 'INELIGIBLE', 'GRANTED', 'REJECTED', 'CANCELLED_BY_REFUND'];
        if (states.includes(promo.state as PromotionState)) dto.promotionState = promo.state as PromotionState;
        if ((promo.state === 'GRANTED' || promo.state === 'INELIGIBLE') && integerString(promo.promo_bonus_amount)) {
          dto.promotionGross = promo.promo_bonus_amount;
        }
      }
      dto.safeReasonCode = null;
      return dto;
    }
    default: return dto;
  }
  dto.safeReasonCode = dto.settlementState === 'RETRY_WAIT' ? 'RETRY_SCHEDULED' : null;
  // PROCESSING retains the old claim time even after its lease expires.
  dto.nextRetryAt = outcome.status === 'PENDING' ? safeTimestamp(outcome.next_retry_at) : null;
  return dto;
}
