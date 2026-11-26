import 'server-only';
import { createPortOneTestDependencies } from './runtime';
import { reconcilePortOneTestPaid } from './service';
import { boundedId, record, UUID } from './protocol';

export async function reconcilePortOneTestWebhook(paymentId: string): Promise<boolean> {
  if (!/^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentId)) return false;
  const deps = createPortOneTestDependencies();
  if (!deps.config) return false;
  const owner = await deps.repository.getWebhookOrder(paymentId);
  return owner ? reconcilePortOneTestPaid(deps, owner, paymentId) : false;
}

// The route invokes this only after raw-body signature and timestamp verification.
// D treats the durable signal as a hint and independently re-reads provider facts.
export async function reconcilePortOneTestCancellation(webhook: unknown,
  metadata: { deliveryId: string; bodySha256: string }): Promise<'ACCEPTED' | 'IGNORED' | 'UNAVAILABLE'> {
  try {
    const body = record(webhook); const data = record(body?.data);
    if (body?.type !== 'Transaction.Cancelled' || !data || typeof data.paymentId !== 'string'
      || !data.paymentId.startsWith('web_') || !UUID.test(data.paymentId.slice(4))
      || !boundedId(data.storeId) || !boundedId(data.transactionId) || !boundedId(data.cancellationId)
      || !boundedId(metadata.deliveryId) || !/^[0-9a-f]{64}(?![\s\S])/.test(metadata.bodySha256)) return 'UNAVAILABLE';
    const deps = createPortOneTestDependencies();
    if (!deps.settlement) return 'IGNORED';
    if (!deps.config) return 'UNAVAILABLE';
    if (!await deps.settlement.matches(data.paymentId, data.storeId)) return 'IGNORED';
    const owner = await deps.repository.getWebhookOrder(data.paymentId);
    if (!owner) return 'UNAVAILABLE';
    const found = await deps.repository.getChargeContext(owner.actorUserId, owner.orderId);
    if (found.kind !== 'FOUND' || found.context.reviewRequired || found.context.actorDeleted
      || !found.context.submissionIntentRecorded || found.context.paymentId !== data.paymentId) return 'UNAVAILABLE';
    const binding = await deps.bindings.getProviderBinding(owner.actorUserId, owner.orderId);
    if (!binding) return 'UNAVAILABLE';
    await deps.settlement.assertScope(owner, found.context, deps.config, binding);
    await deps.settlement.publishCancelled({ version: 1, type: 'cancelled', orderId: owner.orderId,
      paymentId: data.paymentId, storeId: data.storeId, transactionId: data.transactionId,
      cancellationId: data.cancellationId, deliveryId: metadata.deliveryId, bodySha256: metadata.bodySha256 });
    return 'ACCEPTED';
  } catch { return 'UNAVAILABLE'; }
}
