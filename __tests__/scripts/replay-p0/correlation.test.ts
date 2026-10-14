// @vitest-environment node
import { expect, it } from 'vitest';
import type { Envelope } from '@sentry/core';
import { stripReplayCorrelation } from '../../../scripts/replay-p0/correlation';
it('removes SDK Replay links while preserving ordinary event and trace data', () => {
  const input = [{ event_id: 'event', trace: { trace_id: 'trace', replay_id: 'secret' } }, [[{ type: 'event' }, {
    message: 'ordinary', tags: { replayId: 'secret', keep: 'yes' },
    contexts: { Replays: { raw: 'secret' }, replay: { id: 'secret' }, feedback: { replay_id: 'secret', source: 'api' }, trace: { trace_id: 'trace' } },
  }]]] as Envelope;
  const before = structuredClone(input); const output = stripReplayCorrelation(input);
  expect(input).toEqual(before); expect(JSON.stringify(output)).not.toContain('secret');
  expect(output).toEqual([{ event_id: 'event', trace: { trace_id: 'trace' } }, [[{ type: 'event' }, {
    message: 'ordinary', tags: { keep: 'yes' }, contexts: { feedback: { source: 'api' }, trace: { trace_id: 'trace' } },
  }]]]);
});
