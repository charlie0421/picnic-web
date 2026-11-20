import { createClosedReconciliationDeps, createReconciliationHandler } from '@/lib/payment/paypal-charge/reconciliation-entry';

// Internal PayPal reconciliation entry (W3). POST only, with the internal secret header.
// maxDuration 120 is the proposed minimum for one run (spec G5). The platform limit is not verified here (OG2).
export const runtime = 'nodejs';
export const maxDuration = 120;

const handler = createReconciliationHandler(createClosedReconciliationDeps());

export async function POST(request: Request): Promise<Response> {
  return handler(request);
}
