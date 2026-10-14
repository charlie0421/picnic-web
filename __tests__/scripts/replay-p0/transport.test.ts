// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Envelope } from '@sentry/core';
import { createP0Transport } from '../../../scripts/replay-p0/transport';
import { emptyProjectionState, type Gate, type ProjectResult } from '../../../scripts/replay-p0/contract';
const replay: Envelope = [{}, [[{ type: 'replay_event' }, {}], [{ type: 'replay_recording' }, new Uint8Array()]]];
function setup() {
  let gate: Gate = { phase: 'RECORDING', generation: 1 };
  const normal = { send: vi.fn(async () => ({ statusCode: 200 })), flush: vi.fn(async () => true) };
  const close = vi.fn(() => { gate = { phase: 'CLOSED', generation: 2 }; });
  const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
  const transform = vi.fn(async (_input, state): Promise<ProjectResult> => ({ ok: true,
    value: { bytes: new Uint8Array([1]), segment: state.nextSegment, next: { ...state, nextSegment: state.nextSegment + 1 } } }));
  const transport = createP0Transport({ snapshot: () => gate, close, transform, normal, endpoint: 'http://127.0.0.1:8888/replay', fetch: fetcher });
  return { transport, fetcher, transform, normal, close, closeNow: () => { close(); transport.cancel(); } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
it('commits only successful sends and fixes network options', async () => {
  const test = setup(); for (let i = 0; i < 3; i++) expect(await test.transport.send(replay)).toEqual({ statusCode: 200 });
  expect(test.transform.mock.calls.map(call => call[1].nextSegment)).toEqual([0, 1, 2]);
  const options = test.fetcher.mock.calls[0][1];
  expect(options).toMatchObject({ keepalive: false, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
});
it.each([429, 500, 302])('closes on HTTP %i without any later send', async status => {
  const test = setup(); test.fetcher.mockImplementation(async () => new Response(null, { status }));
  expect(await test.transport.send(replay)).toEqual({ statusCode: 403 });
  await test.transport.send(replay); expect(test.fetcher).toHaveBeenCalledTimes(1); expect(test.close).toHaveBeenCalled();
});
it('closes on a rate-limit header even with HTTP 200', async () => {
  const test = setup(); test.fetcher.mockImplementation(async () => new Response(null, { headers: { 'x-sentry-rate-limits': '60:replay' } }));
  expect(await test.transport.send(replay)).toEqual({ statusCode: 403 });
});
it('closes on overlap and discards the late first transform', async () => {
  const test = setup(); let done!: (r: ProjectResult) => void;
  test.transform.mockImplementation(() => new Promise(resolve => { done = resolve; }));
  const first = test.transport.send(replay); expect(await test.transport.send(replay)).toEqual({ statusCode: 403 });
  done({ ok: true, value: { bytes: new Uint8Array([1]), next: emptyProjectionState(), segment: 0 } });
  expect(await first).toEqual({ statusCode: 403 }); expect(test.fetcher).not.toHaveBeenCalled();
});
it('aborts an in-flight request and settles even if fetch ignores abort', async () => {
  const test = setup(); test.fetcher.mockImplementation(() => new Promise(() => undefined));
  const pending = test.transport.send(replay); await vi.advanceTimersByTimeAsync(0);
  test.closeNow(); expect(await pending).toEqual({ statusCode: 403 });
  expect(test.fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});
it('times out fetch at 5000ms', async () => {
  const test = setup(); test.fetcher.mockImplementation(() => new Promise(() => undefined));
  const pending = test.transport.send(replay); await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual({ statusCode: 403 }); expect(test.close).toHaveBeenCalledWith('fetch-timeout');
});
it('rejects mixed envelopes and preserves ordinary delivery', async () => {
  const test = setup(); const ordinary: Envelope = [{}, [[{ type: 'event' }, { message: 'normal' }]]];
  await test.transport.send(ordinary); expect(test.normal.send).toHaveBeenCalledWith(ordinary);
  await test.transport.send([{}, [...replay[1], ...ordinary[1]]]); expect(test.fetcher).not.toHaveBeenCalled(); expect(test.close).toHaveBeenCalled();
});
