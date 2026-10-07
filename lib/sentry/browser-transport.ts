import { makeFetchTransport } from '@sentry/nextjs';
import type { BaseTransportOptions, EnvelopeItem, Transport } from '@sentry/core';
import { scrubReplayEnvelope } from './replay-scrub';

/** Adds bounded Replay preprocessing to an SDK transport without replacing its network/rate-limit handling. */
export function withReplayScrubbing(transport: Transport, recordDroppedEvent: BaseTransportOptions['recordDroppedEvent']): Transport {
  const pending = new Set<Promise<unknown>>();
  return {
    send(envelope) {
      if (!(envelope[1] as EnvelopeItem[]).some(([header]) => header.type === 'replay_event' || header.type === 'replay_recording')) {
        return transport.send(envelope);
      }
      if (pending.size >= 30) {
        recordDroppedEvent('queue_overflow', 'replay');
        return Promise.resolve({});
      }
      const work = (async () => {
        const clean = await scrubReplayEnvelope(envelope);
        if (!clean) { recordDroppedEvent('before_send', 'replay'); return {}; }
        return await transport.send(clean);
      })();
      pending.add(work);
      void work.then(() => pending.delete(work), () => pending.delete(work));
      return work;
    },
    async flush(timeout) {
      const deadline = timeout && timeout > 0 ? Date.now() + timeout : Infinity;
      while (pending.size) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) return false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const waiting = Promise.allSettled(Array.from(pending)).then(() => true);
        const finished = Number.isFinite(remaining)
          ? await Promise.race([waiting, new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), remaining); })]).finally(() => clearTimeout(timer))
          : await waiting;
        if (!finished) return false;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return false;
      return await transport.flush(Number.isFinite(remaining) ? remaining : undefined);
    },
  };
}

export function createBrowserTransport(options: BaseTransportOptions): Transport {
  return withReplayScrubbing(makeFetchTransport(options), options.recordDroppedEvent);
}
