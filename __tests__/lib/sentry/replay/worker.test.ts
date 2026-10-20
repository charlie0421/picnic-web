// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emptyProjectionState } from '@/scripts/replay-p0/contract';
import { voteListWorkerTransform, diagnosticWorkerTransform } from '@/lib/sentry/replay/worker-client';
const transformInWorker = voteListWorkerTransform('http://127.0.0.1:53931', () => 5);

class ControlledWorker {
  static current: ControlledWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  terminate = vi.fn();
  request: { id: number } | undefined;
  constructor() { ControlledWorker.current = this; }
  postMessage(request: { id: number }) { this.request = request; }
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('Worker', ControlledWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('terminates an unresponsive worker at 2000ms', async () => {
  let settled = false;
  const pending = transformInWorker([{}, []], emptyProjectionState(), new AbortController().signal).then(x => { settled = true; return x; });
  await vi.advanceTimersByTimeAsync(1999); expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1); expect(await pending).toEqual({ ok: false, reason: 'worker-timeout' });
  expect(ControlledWorker.current.terminate).toHaveBeenCalledTimes(1);
});
it('discards a result after abort and terminates once', async () => {
  const abort = new AbortController();
  const pending = transformInWorker([{}, []], emptyProjectionState(), abort.signal);
  const worker = ControlledWorker.current; abort.abort();
  worker.onmessage?.({ data: { id: worker.request!.id, result: { ok: true } } });
  expect(await pending).toEqual({ ok: false, reason: 'abort' });
  expect(worker.terminate).toHaveBeenCalledTimes(1);
});
it('ignores a response for a different job', async () => {
  const pending = transformInWorker([{}, []], emptyProjectionState(), new AbortController().signal);
  const worker = ControlledWorker.current;
  worker.onmessage?.({ data: { id: worker.request!.id + 1, result: { ok: false, reason: 'schema' } } });
  await vi.advanceTimersByTimeAsync(2000);
  expect(await pending).toEqual({ ok: false, reason: 'worker-timeout' });
});

it('uses a separate diagnostic Worker and terminates it on abort',async()=>{
 const abort=new AbortController();const pending=diagnosticWorkerTransform('https://www.picnic.fan',()=>5)([{},[]],emptyProjectionState(),abort.signal);
 const worker=ControlledWorker.current;abort.abort();expect(await pending).toEqual({ok:false,reason:'abort'});expect(worker.terminate).toHaveBeenCalledTimes(1);
});
