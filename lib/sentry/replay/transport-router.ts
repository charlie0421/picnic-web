import type { EnvelopeItem, Transport } from '@sentry/core';
import { stripReplayCorrelation } from '@/scripts/replay-p0/correlation';

/** A missing runtime is closed, including SDK-initiated Replay outside the normal controller. */
export function createReplayTransportRouter(normal: Transport, replay: () => Transport | undefined): Transport {
  return {
    send(envelope) {
      if ((envelope[1] as EnvelopeItem[]).some(([header]) => header.type === 'replay_event' || header.type === 'replay_recording')) {
        return replay()?.send(envelope) ?? Promise.resolve({ statusCode: 403 });
      }
      return normal.send(stripReplayCorrelation(envelope));
    },
    flush(timeout) { return (replay() ?? normal).flush(timeout); },
  };
}
