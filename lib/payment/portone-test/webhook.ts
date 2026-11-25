import 'server-only';
import { createPortOneTestDependencies } from './runtime';
import { reconcilePortOneTestPaid } from './service';

export async function reconcilePortOneTestWebhook(paymentId: string): Promise<boolean> {
  if (!/^web_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(paymentId)) return false;
  const deps = createPortOneTestDependencies();
  if (!deps.config) return false;
  const owner = await deps.repository.getWebhookOrder(paymentId);
  return owner ? reconcilePortOneTestPaid(deps, owner, paymentId) : false;
}
