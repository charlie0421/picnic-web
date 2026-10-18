import type { Envelope } from '@sentry/core';
import { expect, it, vi } from 'vitest';
import { createReplayTransportRouter } from '@/lib/sentry/replay/transport-router';

it('drops manual Replay and mixed envelopes when collection is off', async () => {
  const send = vi.fn(async () => ({ statusCode: 200 }));
  const transport = createReplayTransportRouter({ send, flush: async () => true }, () => undefined);
  for (const type of ['replay_event', 'replay_recording']) {
    const envelope: Envelope = [{}, [[{ type }, 'sensitive'], [{ type: 'event' }, { message: 'safe' }]]];
    expect(await transport.send(envelope)).toEqual({ statusCode: 403 });
  }
  expect(send).not.toHaveBeenCalled();
});
it('continues ordinary events while removing Replay linkage', async () => {
  const delivered: Envelope[] = [];
  const normal = { send: async (value: Envelope) => { delivered.push(value); return { statusCode: 200 }; }, flush: async () => true };
  const transport = createReplayTransportRouter(normal, () => undefined);
  const event: Envelope = [{}, [[{ type: 'event' }, { message: 'safe', contexts: { replay: { replay_id: '1'.repeat(32) } } }]]];
  await transport.send(event);
  expect(delivered).toHaveLength(1);
  expect(JSON.stringify(delivered[0])).toContain('safe');
  expect(JSON.stringify(delivered[0])).not.toContain('replay_id');
  expect(await transport.flush(2000)).toBe(true);
});
it('routes Replay only through the currently installed gated transport', async () => {
  const normalSend = vi.fn(async () => ({ statusCode: 200 }));
  const replaySend = vi.fn(async () => ({ statusCode: 202 }));
  let active = true;
  const replay = { send: replaySend, flush: async () => true };
  const transport = createReplayTransportRouter({ send: normalSend, flush: async () => true }, () => active ? replay : undefined);
  const envelope: Envelope = [{}, [[{ type: 'replay_event' }, {}], [{ type: 'replay_recording' }, '']]];
  expect(await transport.send(envelope)).toEqual({ statusCode: 202 });
  active = false;
  expect(await transport.send(envelope)).toEqual({ statusCode: 403 });
  expect(replaySend).toHaveBeenCalledTimes(1);
  expect(normalSend).not.toHaveBeenCalled();
});
