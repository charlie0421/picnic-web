import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { emptyProjectionState, type Gate, type Reason, type Transform } from '@/scripts/replay-p0/contract';
import { stripReplayCorrelation } from '@/scripts/replay-p0/correlation';
import type { DiagnosticAllowance, DiagnosticConfig, DiagnosticDisclosure } from './diagnostic-config';

export type DiagnosticTransportDeps = {
  config: DiagnosticConfig; disclosure: DiagnosticDisclosure; transform: Transform; normal: Transport;
  gate(): Gate; close(reason: Reason): void; locallyEligible(): boolean; visibleId(): string | null;
  eligible(signal: AbortSignal): Promise<DiagnosticAllowance | null>; fetch: typeof fetch;
  onDelivery(state: 'accepted' | 'unknown'): void;
};
const denied = { statusCode: 403 }, LIMIT = 8 * 1024 * 1024;
function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new Error('abort')); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function projectedId(bytes: Uint8Array, expected: string): boolean {
  try {
    // Envelope metadata precedes the binary recording. Bound decoding to that small prefix.
    let end = 0;
    for (let i = 0; i < 3; i++) { end = bytes.indexOf(10, end) + 1; if (end === 0 || end > 8192) return false; }
    const lines = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end)).split('\n');
    const header = JSON.parse(lines[0]), item = JSON.parse(lines[1]), event = JSON.parse(lines[2]);
    return header.event_id === expected && item.type === 'replay_event' && event.event_id === expected && event.replay_id === expected;
  } catch { return false; }
}
export function createDiagnosticTransport(deps: DiagnosticTransportDeps): { transport: Transport; cancel(): void } {
  if (!/^https:\/\/o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io\/api\/[1-9]\d*\/envelope\/\?sentry_key=[a-f0-9]{32}&sentry_version=7$/.test(deps.config.endpoint)) throw new Error('Invalid diagnostic endpoint');
  let state = emptyProjectionState(), attemptedBytes = 0;
  const agreedDisclosure = JSON.stringify(deps.disclosure);
  let active: AbortController | undefined, pending: Promise<TransportMakeRequestResponse> | undefined;
  let posted = false, deliveryKnown = false;
  const delivery = (value: 'accepted' | 'unknown') => { if (!posted || deliveryKnown) return; deliveryKnown = true; deps.onDelivery(value); };
  function cancel() { delivery('unknown'); active?.abort(); }
  function fail(reason: Reason) { try { deps.close(reason); } finally { cancel(); } return denied; }
  function send(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    const items = envelope[1].filter(item => ['replay_event', 'replay_recording'].includes(item[0].type));
    if (!items.length) return deps.normal.send(stripReplayCorrelation(envelope));
    if (items.length !== 2 || envelope[1].length !== 2) return Promise.resolve(fail('schema'));
    const id = deps.visibleId();
    if (!id || !/^[a-f0-9]{32}$/.test(id)) return Promise.resolve(fail('sequence'));
    const gate = deps.gate();
    if (gate.phase !== 'RECORDING') return Promise.resolve(denied);
    if (active) return Promise.resolve(fail('overlap'));
    if (!deps.locallyEligible()) return Promise.resolve(fail('ineligible'));
    const abort = new AbortController(); active = abort; posted = false; deliveryKnown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const matches = () => {
      const current = deps.gate();
      if (abort.signal.aborted || current.phase !== 'RECORDING' || current.generation !== gate.generation) return false;
      if (deps.visibleId() !== id) { fail('sequence'); return false; }
      if (!deps.locallyEligible()) { fail('ineligible'); return false; }
      return true;
    };
    const deadline = (ms: number, reason: Reason) => { clearTimeout(timer); timer = setTimeout(() => fail(reason), ms); };
    const work = async (): Promise<TransportMakeRequestResponse> => {
      try {
        deadline(2000, 'worker-timeout');
        const result = await abortable(deps.transform(envelope, state, abort.signal), abort.signal);
        clearTimeout(timer);
        if (!matches()) return denied;
        if (!result.ok) return fail(result.reason);
        if (result.value.next.replayId !== id || !projectedId(result.value.bytes, id)) return fail('sequence');
        deadline(1000, 'ineligible');
        const allowance = await abortable(deps.eligible(abort.signal), abort.signal);
        clearTimeout(timer);
        if (!matches()) return denied;
        if (!allowance || allowance.allowed !== true || allowance.manifestSha256 !== deps.config.manifestSha256
          || JSON.stringify(allowance.disclosure) !== agreedDisclosure) return fail('ineligible');
        const length = result.value.bytes.byteLength;
        if (!length || length > LIMIT - attemptedBytes) return fail('budget');
        // No await between the final gate, byte reservation and the network call. Attempts are never refunded.
        if (!matches()) return denied;
        attemptedBytes += length; posted = true; deadline(5000, 'fetch-timeout');
        const response = await abortable(deps.fetch(deps.config.endpoint, {
          method: 'POST', body: new Uint8Array(result.value.bytes), signal: abort.signal,
          credentials: 'omit', redirect: 'error', keepalive: false, referrerPolicy: 'no-referrer',
        }), abort.signal);
        if (!matches()) { delivery('unknown'); return denied; }
        if (response.status < 200 || response.status >= 300 || response.redirected
          || response.headers.get('x-sentry-rate-limits') || response.headers.get('retry-after')) return fail('http');
        state = result.value.next; delivery('accepted'); return { statusCode: response.status };
      } catch { return abort.signal.aborted ? denied : fail('http'); }
      finally { clearTimeout(timer); if (active === abort) active = undefined; }
    };
    const job = work(); pending = job;
    void job.then(() => { if (pending === job) pending = undefined; });
    return job;
  }
  async function flush(timeout?: number): Promise<boolean> {
    const start = performance.now(); let settled = true;
    if (pending) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const waiting = pending.then(() => true, () => false);
      settled = timeout === undefined ? await waiting : await Promise.race([waiting,
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), Math.max(0, timeout)); })]);
      clearTimeout(timer);
    }
    const remaining = timeout === undefined ? undefined : Math.max(0, timeout - (performance.now() - start));
    const normal = deps.normal.flush(remaining);
    if (remaining === 0) { void Promise.resolve(normal).catch(() => {}); return false; }
    return (await normal) && settled;
  }
  return { transport: { send, flush }, cancel };
}
