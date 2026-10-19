import type { ProjectResult, Transform } from '@/scripts/replay-p0/contract';

let sequence = 0;
const workerTransform = (createWorker: () => Worker, origin: string, bannerCount: () => number): Transform => (input, state, signal) => new Promise(resolve => {
  if (signal.aborted) { resolve({ ok: false, reason: 'abort' }); return; }
  const id = ++sequence;
  let done = false;
  let worker: Worker | undefined;
  const finish = (result: ProjectResult) => {
    if (done) return;
    done = true; clearTimeout(timer); signal.removeEventListener('abort', aborted);
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.terminate(); }
    resolve(result);
  };
  const aborted = () => finish({ ok: false, reason: 'abort' });
  const timer = setTimeout(() => finish({ ok: false, reason: 'worker-timeout' }), 2000);
  signal.addEventListener('abort', aborted, { once: true });
  try {
    worker = createWorker();
    worker.onerror = () => finish({ ok: false, reason: 'schema' });
    worker.onmessage = event => {
      if (event.data?.id === id) finish(event.data.result);
    };
    worker.postMessage({ id, input, state, origin, bannerCount: bannerCount() });
  } catch { finish({ ok: false, reason: 'schema' }); }
});
export const voteListWorkerTransform = (origin: string, bannerCount: () => number): Transform =>
  workerTransform(() => new Worker(new URL('./worker.ts', import.meta.url)), origin, bannerCount);
export const diagnosticWorkerTransform = (origin: string, bannerCount: () => number): Transform =>
  workerTransform(() => new Worker(new URL('./diagnostic-worker.ts', import.meta.url)), origin, bannerCount);
