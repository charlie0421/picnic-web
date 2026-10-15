import { serializeEnvelope, type Envelope } from '@sentry/core';
import type { ProjectResult, ProjectionState } from '../contract';
import { nodeBudget } from './nodes';
import { projectRecords, timestamp } from './records';
import type { Contract } from './types';
import { bag, checkTreeBudget, decoder, encoder, fields, integer, MAX_BYTES, Rejected, requireValue } from './values';

async function codec(bytes: Uint8Array, decompress: boolean): Promise<Uint8Array> {
  const transform = decompress ? new DecompressionStream('deflate') : new CompressionStream('deflate');
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(transform);
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const item = await reader.read(); if (item.done) break;
      length += item.value.byteLength; requireValue(length <= MAX_BYTES, 'budget'); chunks.push(item.value);
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  const result = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Builds a new envelope from validated values only. Never forwards input fields. */
export async function projectWithContract(input: Envelope, state: ProjectionState, contract: Contract): Promise<ProjectResult> {
  try {
    requireValue(Array.isArray(input) && input.length === 2 && Array.isArray(input[1]) && input[1].length === 2);
    const [header, items] = input; const replay = items.find(i => i[0].type === 'replay_event');
    const recording = items.find(i => i[0].type === 'replay_recording'); requireValue(replay && recording);
    const event = bag(replay[1]); checkTreeBudget(event);
    const replayId = event.replay_id;
    requireValue(typeof replayId === 'string' && /^[a-f0-9]{32}$/.test(replayId) && event.event_id === replayId && header.event_id === replayId, 'sequence');
    const segment = integer(event.segment_id, 0, 2 ** 31 - 1);
    requireValue(segment === state.nextSegment && (state.replayId === null || state.replayId === replayId), 'sequence');
    requireValue(event.type === 'replay_event' && event.replay_type === 'session');
    requireValue(bag(event.sdk).version === contract.sdkVersion);
    requireValue(typeof event.replay_start_timestamp === 'number' && Number.isFinite(event.replay_start_timestamp));
    const start = event.replay_start_timestamp * 1000;
    requireValue(start >= 0 && (state.sessionStartMs === null || start === state.sessionStartMs), 'sequence');
    requireValue(typeof event.timestamp === 'number'); timestamp(event.timestamp * 1000, start);
    const payload = recording[1]; requireValue(typeof payload === 'string' || payload instanceof Uint8Array);
    const bytes = typeof payload === 'string' ? encoder.encode(payload) : payload;
    requireValue(bytes.byteLength <= MAX_BYTES, 'budget');
    const split = bytes.indexOf(10); requireValue(split > 0);
    const recordingHeader = fields(JSON.parse(decoder.decode(bytes.subarray(0, split))), ['segment_id']);
    requireValue(recordingHeader.segment_id === segment, 'sequence');
    let body = bytes.subarray(split + 1);
    const compressed = body[0] !== 91;
    if (compressed) body = await codec(body, true);
    requireValue(body.byteLength <= MAX_BYTES, 'budget');
    const records: unknown = JSON.parse(decoder.decode(body)); checkTreeBudget(records);
    requireValue(Array.isArray(records)); requireValue(records.length <= 10000, 'budget');
    const next = structuredClone(state); next.replayId = replayId; next.sessionStartMs = start; nodeBudget(next);
    const clean = projectRecords(records, next, segment, contract);
    const segmentHeader = encoder.encode(JSON.stringify({ segment_id: segment }) + '\n');
    const rawOutput = encoder.encode(JSON.stringify(clean));
    requireValue(rawOutput.byteLength + segmentHeader.byteLength <= MAX_BYTES, 'budget');
    const encodedOutput = compressed ? await codec(rawOutput, false) : rawOutput;
    const outputRecording = new Uint8Array(segmentHeader.length + encodedOutput.length);
    outputRecording.set(segmentHeader); outputRecording.set(encodedOutput, segmentHeader.length);
    requireValue(outputRecording.byteLength <= MAX_BYTES, 'budget');
    const sdk = { name: 'sentry.javascript.browser', version: contract.sdkVersion };
    const metadata = { type: 'replay_event' as const, replay_type: 'session' as const, event_id: replayId, replay_id: replayId,
      segment_id: segment, timestamp: event.timestamp, replay_start_timestamp: event.replay_start_timestamp,
      release: contract.metadata.release, environment: contract.metadata.environment, platform: 'javascript', sdk,
      urls: ['https://replay.invalid/ko/vote'], error_ids: [], trace_ids: [] };
    const envelope: Envelope = [{ event_id: replayId, sdk }, [
      [{ type: 'replay_event' }, metadata],
      [{ type: 'replay_recording', length: outputRecording.length }, outputRecording],
    ]];
    const serialized = serializeEnvelope(envelope);
    const output = typeof serialized === 'string' ? encoder.encode(serialized) : serialized;
    requireValue(output.byteLength <= MAX_BYTES, 'budget'); next.nextSegment++;
    return { ok: true, value: { bytes: output, next, segment } };
  } catch (error) { return { ok: false, reason: error instanceof Rejected ? error.reason : 'schema' }; }
}
