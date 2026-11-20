import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseQueueClaimResult, parseQueueFinishResult, parseRunRecordResult, RECONCILIATION_METRIC_KEYS,
  type QueueClaimResult, type QueueFinishCode, type QueueFinishResult, type ReconciliationRunInput,
} from './durability-contract';
import { callWebPaymentServiceRpc, projectWireResponse } from './repository';

// W1 queue client. It consumes only S5-S7 and uses the shared safe RPC envelope
// (one request, retry(false), ten-second deadline, sanitized errors).
export interface ReconciliationRepository {
  claim(executorId: string, leaseSeconds: number): Promise<QueueClaimResult>;
  finish(orderId: string, leaseToken: string, result: QueueFinishCode): Promise<QueueFinishResult>;
  recordRun(run: ReconciliationRunInput): Promise<{ replayed: boolean }>;
}

export function createReconciliationRepository(client: SupabaseClient): ReconciliationRepository {
  const rpc = (name: string, args: Record<string, unknown>) => callWebPaymentServiceRpc(client, name, args);
  return {
    async claim(executorId, leaseSeconds) {
      const data = await rpc('claim_web_payment_reconciliation_item', { p_executor_id: executorId, p_lease_seconds: leaseSeconds });
      return projectWireResponse(() => parseQueueClaimResult(data));
    },
    async finish(orderId, leaseToken, result) {
      const data = await rpc('finish_web_payment_reconciliation_item', { p_order_id: orderId, p_lease_token: leaseToken, p_result_code: result });
      return projectWireResponse(() => parseQueueFinishResult(data));
    },
    // The SQL function has no defaults, so STARTED sends explicit null metrics and result code.
    // FINISHED sends exactly the 14 metric keys of the S7 contract.
    async recordRun(run) {
      const finished = run.phase === 'FINISHED' ? run : null;
      const metrics = finished
        ? Object.fromEntries(RECONCILIATION_METRIC_KEYS.map(key => [key, finished.metrics[key]])) : null;
      const data = await rpc('record_web_payment_reconciliation_run', { p_run_id: run.runId, p_executor_id: run.executorId,
        p_phase: run.phase, p_instance_id: run.instanceId, p_metrics: metrics,
        p_result_code: finished ? finished.resultCode : null });
      return projectWireResponse(() => parseRunRecordResult(data));
    },
  };
}
