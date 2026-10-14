import type { ProjectResult, Transform } from './contract';

let sequence = 0;
export const transformInWorker: Transform = (input, state, signal) => new Promise(resolve => {
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
    worker = new Worker('/worker.js');
    worker.onerror = () => finish({ ok: false, reason: 'schema' });
    worker.onmessage = event => {
      if (event.data?.id === id) finish(event.data.result);
    };
    worker.postMessage({ id, input, state });
  } catch { finish({ ok: false, reason: 'schema' }); }
});
