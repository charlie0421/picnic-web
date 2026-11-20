import 'server-only';
import type { LogEventCode } from '@/utils/log-event-codes';
import type { QueueClaimResult, QueueFinishCode, ReadCycleReport, ReadWindow, ReconciliationMetrics,
  ReconciliationRunResultCode } from './durability-contract';
import { reconcilePayPalOrder, type PayPalChargeDeps, type PayPalChargeOutcome } from './orchestrator';
import type { ProviderEntryGate } from './provider-entry';
import { remainingReadMs } from './read-cycle';
import type { ReconciliationRepository } from './reconciliation-repository';
import type { WebPaymentChargeRepository } from './repository';
import type { PayPalTransport } from './transport';

// W3 bounded GET executor (spec G5, 7/10 sections 4 and 5; plan section W3).
// One run records STARTED, claims queue items one at a time, performs at most one protected read for each item
// through the W2 reconcile workflow, finishes each item and records FINISHED.
// The run sends no charge claim, no intent, no CREATE and no capture POST.
// A lease token, a cycle token and a credential never enter a log entry or the summary.

// t0 is the time of the STARTED ACK. No new claim starts at or after t0 + 20 s.
const CLAIM_CUTOFF_MS = 20_000;
// Provider and resolver reads end, and no new read starts, at t0 + 55 s. This is not a bound on the whole run.
const READ_DEADLINE_MS = 55_000;
// A new OPEN needs 20 s of read budget: at most 10 s for the OPEN reply and 10 s for the GET.
const OPEN_MIN_REMAINING_MS = 20_000;
// The queue lease covers one item: reads until the read deadline, then the completion and the finish.
const LEASE_SECONDS = 120;
const MAX_ITEMS = 25;
const RUN_FAILED: LogEventCode = 'payment.paypal.reconcile.run.failed';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// window is the trusted in-memory read budget of the run. A production factory binds its DB reads to it.
export type ReconciliationItem = { orderId: string; userId: string; window: ReadWindow };
export type ReconciliationLogEntry = { level: 'error'; code: LogEventCode; phase: 'STARTED' | 'FINISHED' };
export type ReconciliationExecutorDeps = {
  queue: ReconciliationRepository;
  // Called once for each claimed item. orderId and userId are the values that the queue claim returned.
  chargeDeps: (item: ReconciliationItem) => Omit<PayPalChargeDeps, 'runtime'>;
  nowMs: () => number;
  log: (entry: ReconciliationLogEntry) => void;
};
export type ReconciliationBatchInput = { executorId: string; runId: string; instanceId: string; maxItems: number;
  signal: AbortSignal };
// started and finished state whether the STARTED and the FINISHED run record were acknowledged.
export type ReconciliationRunSummary = { started: boolean; finished: boolean; resultCode: ReconciliationRunResultCode;
  metrics: ReconciliationMetrics };

type Claimed = Extract<QueueClaimResult, { kind: 'CLAIMED' }>;
// Causes of the run result. A higher result does not erase the metrics of a lower cause.
type Causes = { writeFailed: boolean; staleLease: boolean; discoveryFailed: boolean; budget: boolean; credential: boolean };
// Local facts of one item that the W2 report alone cannot state.
type ItemState = { report: ReadCycleReport | null; localDeferral: boolean; openLost: boolean; completeLost: boolean };

class LocalOpenDeferral extends Error {
  constructor() { super('WEB_PAYMENT_RECONCILIATION_OPEN_DEFERRED'); }
}
class OpenNotApplicable extends Error {
  constructor() { super('WEB_PAYMENT_RECONCILIATION_OPEN_NOT_APPLICABLE'); }
}
function refused<T>(): Promise<T> {
  return Promise.reject(new Error('WEB_PAYMENT_RECONCILIATION_READ_ONLY'));
}

function clock(deps: Pick<ReconciliationExecutorDeps, 'nowMs'>): number {
  try { const value = deps.nowMs(); return Number.isFinite(value) ? value : NaN; } catch { return NaN; }
}
function logRunFailed(deps: Pick<ReconciliationExecutorDeps, 'log'>, phase: ReconciliationLogEntry['phase']) {
  try { deps.log({ level: 'error', code: RUN_FAILED, phase }); } catch { /* Logging cannot change the run. */ }
}
function zeroMetrics(): ReconciliationMetrics {
  return { claimed: 0, opened: 0, completed_clean: 0, completed_adverse: 0, completed_no_data: 0, held: 0, deferred: 0,
    credential_unavailable: 0, in_progress: 0, failed: 0, read_cancelled: 0, write_unknown: 0, stale_lease: 0,
    // S5 returns no due time. The executor does not derive a lag from a lease or from its own clock.
    oldest_due_lag_seconds: 0 };
}
function validInput(input: ReconciliationBatchInput): boolean {
  try {
    return UUID.test(input.executorId) && UUID.test(input.runId) && typeof input.instanceId === 'string'
      && input.instanceId.length >= 1 && input.instanceId.length <= 120 && input.instanceId.trim() !== ''
      && Number.isInteger(input.maxItems) && input.maxItems >= 1 && input.maxItems <= MAX_ITEMS
      && input.signal instanceof AbortSignal;
  } catch { return false; }
}

// The repository of one item. Reads and the prepare replay pass through unchanged.
// OPEN is refused locally when less than 20 s of read budget is left. The refusal sends no RPC. It is a local
// deferral, and it is not an acknowledged DB answer, so W2 cannot continue to an unprotected read.
// A thrown OPEN or completion RPC is recorded as a lost ACK. Charge commands are not available to a run.
// An acknowledged NOT_APPLICABLE is not returned to W2. For a getter with no confirmed intent, W2 would continue
// from that answer to its unprotected S6 read. A scanner read is protected by P2 only, so the adapter ends the
// cycle as a recognized local failure. The server answer is not changed, and it is not a lost ACK.
function itemRepository(base: WebPaymentChargeRepository, window: ReadWindow, state: ItemState): WebPaymentChargeRepository {
  return {
    getChargeContext: (...args) => base.getChargeContext(...args),
    prepareProviderContext: (...args) => base.prepareProviderContext(...args),
    bindProviderIdentity: (...args) => base.bindProviderIdentity(...args),
    recordObservation: (...args) => base.recordObservation(...args),
    recordPreIntentAssertions: (...args) => base.recordPreIntentAssertions(...args),
    claimCharge: () => refused(),
    recordSubmissionIntent: () => refused(),
    recordSubmissionResult: () => refused(),
    receivePurchase: () => refused(),
    async openReadCycle(actorUserId, orderId, actorKind) {
      if (!(remainingReadMs(window) >= OPEN_MIN_REMAINING_MS)) { state.localDeferral = true; throw new LocalOpenDeferral(); }
      let result;
      try { result = await base.openReadCycle(actorUserId, orderId, actorKind); }
      catch (error) { state.openLost = true; throw error; }
      if (result.kind === 'NOT_APPLICABLE') throw new OpenNotApplicable();
      return result;
    },
    async completeReadCycle(cycleId, cycleToken, input) {
      try { return await base.completeReadCycle(cycleId, cycleToken, input); }
      catch (error) { state.completeLost = true; throw error; }
    },
  };
}
function readOnlyTransport(base: PayPalTransport): PayPalTransport {
  return { requestToken: input => base.requestToken(input), getOrder: input => base.getOrder(input),
    createOrder: () => refused(), captureOrder: () => refused() };
}
const CLOSED_ENTRY: ProviderEntryGate = { authorizeProviderEntry: () => refused() };

// Plan W3 finish mapping. The read report of W2 is the trusted source. The workflow outcome is used only when
// no report exists. Each branch counts its own metric.
function settle(state: ItemState, outcome: PayPalChargeOutcome | null, metrics: ReconciliationMetrics, causes: Causes): QueueFinishCode {
  const deferred = (): QueueFinishCode => { metrics.deferred += 1; causes.budget = true; return 'DEFERRED'; };
  const held = (): QueueFinishCode => { metrics.held += 1; return 'HELD'; };
  const failed = (): QueueFinishCode => { metrics.failed += 1; return 'FAILED'; };
  // An attempted write with no ACK. The executor does not assume that it committed or that it did not.
  const lostWrite = () => { metrics.write_unknown += 1; causes.writeFailed = true; };
  const report = state.report;
  if (report?.readCancelled) metrics.read_cancelled += 1;
  // No OPEN was sent. This is neither an acknowledged refusal nor a lost write.
  if (state.localDeferral) return deferred();
  if (report) {
    if (report.opened) metrics.opened += 1;
    if (report.kind === 'COMPLETED') {
      if (report.effectiveKind === 'ADVERSE') { metrics.completed_adverse += 1; return held(); }
      if (report.effectiveKind === 'NO_DATA') { metrics.completed_no_data += 1; return report.hold?.grantBlocked ? held() : 'NO_DATA'; }
      if (report.effectiveKind !== 'CLEAN') return failed();
      metrics.completed_clean += 1;
      if (report.intake?.kind === 'INTAKE_PENDING') return 'INTAKE_PENDING';
      // INTAKE_HELD or a blocked hold is HELD. NO_CHANGE does not hide it.
      if (report.intake?.kind === 'REVIEW_REQUIRED' || report.hold?.grantBlocked) return held();
      return 'NO_CHANGE';
    }
    if (report.kind === 'CONFLICT') return held();
    // A late result was acknowledged. It is a failed item and not an unknown write.
    if (report.kind === 'LATE') return failed();
    if (report.kind === 'WRITE_UNKNOWN') {
      // reason FAILED is the acknowledged BLOCKED answer. Every other case is a lost completion ACK.
      if (state.completeLost || report.reason !== 'FAILED') lostWrite();
      return failed();
    }
    if (report.reason === 'DEFERRED') return deferred();
    if (report.reason === 'IN_PROGRESS') { metrics.in_progress += 1; return 'IN_PROGRESS'; }
    // NOT_FOUND, and NOT_APPLICABLE through the item adapter, are acknowledged refusals. A thrown OPEN RPC is a lost ACK.
    if (state.openLost) lostWrite();
    return failed();
  }
  if (!outcome) return failed();
  // REVIEW_REQUIRED with no read report. The native finish evaluates the current hold again.
  if (outcome.kind === 'REVIEW_REQUIRED') return held();
  if (outcome.kind === 'UNAVAILABLE' && (outcome.stage === 'CREDENTIAL' || outcome.stage === 'TOKEN')) {
    metrics.credential_unavailable += 1; causes.credential = true; return 'CREDENTIAL_UNAVAILABLE';
  }
  // Owner, prepare or binding failure, or any other end with no read report.
  return failed();
}

async function readItem(deps: ReconciliationExecutorDeps, claim: Claimed, window: ReadWindow, state: ItemState): Promise<PayPalChargeOutcome | null> {
  try {
    const base = deps.chargeDeps({ orderId: claim.orderId, userId: claim.userId, window });
    const itemDeps: PayPalChargeDeps = {
      repository: itemRepository(base.repository, window, state), bindings: base.bindings, credentials: base.credentials,
      transport: readOnlyTransport(base.transport), entry: CLOSED_ENTRY, nowMs: base.nowMs,
      // W2 reports the local OPEN deferral as a failed cycle. That entry would be false, so it is not logged.
      log: entry => { if (state.localDeferral && entry.stage === 'CYCLE') return; base.log(entry); },
      runtime: { actorKind: 'SCANNER', window, onReadResult: report => { state.report = report; } },
    };
    // The actor is the DB owner of the order. No caller value selects the actor or the order.
    return await reconcilePayPalOrder(itemDeps, { actorUserId: claim.userId, orderId: claim.orderId });
  } catch { return null; }
}

async function processItem(deps: ReconciliationExecutorDeps, claim: Claimed, window: ReadWindow,
  metrics: ReconciliationMetrics, causes: Causes): Promise<void> {
  let code: QueueFinishCode;
  if (window.signal.aborted || !(remainingReadMs(window) > 0)) {
    // No read budget is left for the owner read. No read is sent, and the lease is returned.
    metrics.deferred += 1; causes.budget = true; code = 'DEFERRED';
  } else {
    const state: ItemState = { report: null, localDeferral: false, openLost: false, completeLost: false };
    code = settle(state, await readItem(deps, claim, window, state), metrics, causes);
  }
  // The finish is a started write. It is awaited to its own client deadline and it is sent once.
  let finish;
  try { finish = await deps.queue.finish(claim.orderId, claim.leaseToken, code); }
  catch { metrics.write_unknown += 1; causes.writeFailed = true; return; }
  // Another executor owns the lease. The queue row is not written again.
  if (finish.kind === 'STALE_LEASE') { metrics.stale_lease += 1; causes.staleLease = true; }
}

export async function runPayPalReconciliationBatch(deps: ReconciliationExecutorDeps,
  input: ReconciliationBatchInput): Promise<ReconciliationRunSummary> {
  const metrics = zeroMetrics();
  const unrecorded = (): ReconciliationRunSummary => {
    logRunFailed(deps, 'STARTED');
    return { started: false, finished: false, resultCode: 'WRITE_FAILED', metrics };
  };
  if (!validInput(input)) return unrecorded();
  const run = { runId: input.runId, executorId: input.executorId, instanceId: input.instanceId };
  // A failed STARTED record ends the run: no claim and no read.
  try { await deps.queue.recordRun({ ...run, phase: 'STARTED' }); } catch { return unrecorded(); }

  const t0 = clock(deps);
  const window: ReadWindow = { deadlineAtMs: t0 + READ_DEADLINE_MS, signal: input.signal, nowMs: () => clock(deps) };
  const causes: Causes = { writeFailed: false, staleLease: false, discoveryFailed: false, budget: false, credential: false };
  while (metrics.claimed < input.maxItems) {
    // The soft cutoff, or a cancelled run, prevents a new claim. A clock failure gives no claim budget.
    if (input.signal.aborted || !(clock(deps) < t0 + CLAIM_CUTOFF_MS)) { causes.budget = true; break; }
    let claim: QueueClaimResult;
    try { claim = await deps.queue.claim(input.executorId, LEASE_SECONDS); }
    catch { causes.discoveryFailed = true; break; }
    if (claim.kind === 'EMPTY') break;
    metrics.claimed += 1;
    await processItem(deps, claim, window, metrics, causes);
  }

  const resultCode: ReconciliationRunResultCode = causes.writeFailed ? 'WRITE_FAILED' : causes.staleLease ? 'PARTIAL_STALE_LEASE'
    : causes.discoveryFailed ? 'DISCOVERY_FAILED' : causes.budget ? 'PARTIAL_BUDGET'
    : causes.credential ? 'CREDENTIAL_UNAVAILABLE' : 'OK';
  // The FINISHED record is sent once. A health check finds a STARTED record that has no FINISHED record.
  try { await deps.queue.recordRun({ ...run, phase: 'FINISHED', metrics, resultCode }); }
  catch { logRunFailed(deps, 'FINISHED'); return { started: true, finished: false, resultCode, metrics }; }
  return { started: true, finished: true, resultCode, metrics };
}
