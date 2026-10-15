import type { Envelope, Transport, TransportMakeRequestResponse } from '@sentry/core';
import { emptyProjectionState, type Gate, type Reason, type Transform } from './contract';
import { stripReplayCorrelation } from './correlation';

export type TransportDeps = { snapshot(): Gate; close(reason: Reason): void;
  transform: Transform; normal: Transport; endpoint: string; fetch: typeof fetch };
const denied = { statusCode: 403 };

function abortable<T>(promise: PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(new Error('abort'));
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

export function createP0Transport(deps: TransportDeps): Transport & { cancel(): void } {
  const endpoint = new URL(deps.endpoint);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.pathname !== '/replay'
    || endpoint.search || endpoint.hash || endpoint.username || endpoint.password) throw new Error('loopback-only');
  let state = emptyProjectionState();
  let active: AbortController | undefined;
  let pending: Promise<TransportMakeRequestResponse> | undefined;
  function cancel() { state = emptyProjectionState(); active?.abort(); }
  function fail(reason: Reason) {
    try { deps.close(reason); } finally { cancel(); }
    return denied;
  }
  function send(envelope: Envelope): PromiseLike<TransportMakeRequestResponse> {
    const replayItems = envelope[1].filter(i => i[0].type === 'replay_event' || i[0].type === 'replay_recording');
    if (replayItems.length === 0) return deps.normal.send(stripReplayCorrelation(envelope));
    if (envelope[1].length !== 2 || replayItems.length !== 2) return Promise.resolve(fail('schema'));
    const gate = deps.snapshot();
    if (gate.phase !== 'RECORDING') return Promise.resolve(denied);
    if (active) return Promise.resolve(fail('overlap'));
    const abort = new AbortController(); active = abort;
    const matches = () => {
      const current = deps.snapshot(); return !abort.signal.aborted && current.phase === 'RECORDING' && current.generation === gate.generation;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const work = async (): Promise<TransportMakeRequestResponse> => {
      try {
        const result = await abortable(deps.transform(envelope, state, abort.signal), abort.signal);
        if (!matches()) return denied;
        if (!result.ok) return fail(result.reason);
        timer = setTimeout(() => fail('fetch-timeout'), 5000);
        // Last gate check is synchronous with the network call.
        if (!matches()) return denied;
        const response = await abortable(deps.fetch(endpoint.href, {
          method: 'POST', body: new Uint8Array(result.value.bytes), signal: abort.signal,
          keepalive: false, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
          headers: { 'Content-Type': 'application/x-sentry-envelope' },
        }), abort.signal);
        if (!matches()) return denied;
        if (response.status < 200 || response.status >= 300
          || response.headers.get('x-sentry-rate-limits') || response.headers.get('retry-after')) return fail('http');
        state = result.value.next;
        return { statusCode: response.status };
      } catch { return abort.signal.aborted ? denied : fail('http'); }
      finally { clearTimeout(timer); if (active === abort) active = undefined; }
    };
    pending = work();
    void pending.then(() => { pending = undefined; }, () => { pending = undefined; });
    return pending;
  }
  async function flush(timeout?: number): Promise<boolean> {
    const start = Date.now(); const work = pending;
    if (work) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const settled = work.then(() => true, () => false);
      const done = timeout !== undefined && timeout > 0
        ? await Promise.race([settled, new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeout); })])
        : await settled;
      clearTimeout(timer); if (!done) return false;
    }
    const remaining = timeout === undefined ? undefined : timeout - (Date.now() - start);
    if (remaining !== undefined && remaining <= 0) return false;
    return deps.normal.flush(remaining);
  }
  return { send, flush, cancel };
}
