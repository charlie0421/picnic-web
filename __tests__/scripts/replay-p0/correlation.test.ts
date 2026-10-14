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
it('removes standalone and transaction child-span data links without changing span metrics', () => {
  const span = { span_id: 'span', trace_id: 'trace', data: { replay_id: 'secret', replayId: 'secret', 'sentry.op': 'ui.interaction.click', value: 120 } };
  const input = [{}, [[{ type: 'span' }, span], [{ type: 'transaction' }, { type: 'transaction', spans: [span] }]]] as Envelope;
  const before = structuredClone(input); const output = stripReplayCorrelation(input);
  expect(input).toEqual(before); expect(JSON.stringify(output)).not.toContain('secret');
  expect((output[1][0][1] as any).data).toEqual({ 'sentry.op': 'ui.interaction.click', value: 120 });
  expect((output[1][1][1] as any).spans[0].data).toEqual({ 'sentry.op': 'ui.interaction.click', value: 120 });
});
