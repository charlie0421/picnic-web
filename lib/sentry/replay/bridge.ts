import type { Transport } from '@sentry/core';
import type { LocalReplayConfig } from './config';
import { localPageIsSafe } from './page-safety';
import { replaySignals } from './signals';
import { createProductReplayRuntime } from './runtime';
import { voteListWorkerTransform } from './worker-client';
import { replayDocumentReady, observeReplayDocumentReady } from './document-ready';

/** Loaded only by the explicitly enabled, loopback-only synthetic product build. */
export async function attachLocalReplay(config: LocalReplayConfig, normal: Transport): Promise<Transport | undefined> {
  // A browser SDK's absent-session result cannot rule out an HttpOnly cookie.
  const abort = new AbortController(); const timer = setTimeout(() => abort.abort(), 1000);
  const unsubscribe = replaySignals.subscribe(state => { if (state.closed) abort.abort(); });
  try {
    const response = await fetch('/api/replay/eligibility', { cache: 'no-store', credentials: 'same-origin', signal: abort.signal });
    const body: unknown = await response.json();
    if (!response.ok || !body || typeof body !== 'object' || Object.keys(body).length !== 1
      || !('anonymous' in body) || body.anonymous !== true) { replaySignals.close(); return; }
  } catch { replaySignals.close(); return; }
  finally { clearTimeout(timer); unsubscribe(); }
  if (replaySignals.snapshot().closed) return;
  try {
    const runtime = createProductReplayRuntime({
      config, signals: replaySignals, normal,
      fetch: window.fetch.bind(window), transform: voteListWorkerTransform(config.origin, () => replaySignals.snapshot().bannerCount),
      page: () => ({ href: location.href, ready: replayDocumentReady(document), visible: document.visibilityState === 'visible' && localPageIsSafe() }),
      onReady: callback => observeReplayDocumentReady(window, callback),
      load: async () => {
        const Sentry = await import('@sentry/nextjs');
        let replay: ReturnType<typeof Sentry.replayIntegration> | undefined;
        return {
          start() {
            replay = Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true,
              stickySession: false, useCompression: false, minReplayDuration: 0, flushMinDelay: 1500, flushMaxDelay: 1500 });
            Sentry.addIntegration(replay);
            try { replay.start(); }
            finally {
              // Replay registers its own DSC hook in start(); ours must run after it.
              Sentry.getClient()?.on('createDsc', dsc => { delete dsc.replay_id; });
            }
          },
          async stop() { await replay?.stop(); },
          async flush() { await replay?.flush(); },
        };
      },
    });
    return runtime.transport;
  } catch { replaySignals.close(); return; }
}
