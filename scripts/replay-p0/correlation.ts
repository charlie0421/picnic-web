import type { Envelope } from '@sentry/core';

type Bag = Record<string, unknown>;
function object(value: unknown): value is Bag {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Uint8Array);
}
function withoutLinks(value: Bag): Bag {
  const result = { ...value }; delete result.replayId; delete result.replay_id; return result;
}
/** Remove SDK-owned links at the final ordinary-envelope boundary without mutating SDK state. */
export function stripReplayCorrelation(envelope: Envelope): Envelope {
  const header = { ...envelope[0] };
  if (object(header.trace)) header.trace = withoutLinks(header.trace);
  const items = envelope[1].map(([itemHeader, raw]) => {
    if (!object(raw)) return [itemHeader, raw];
    const payload = withoutLinks(raw);
    if (object(raw.tags)) payload.tags = withoutLinks(raw.tags);
    if (object(raw.contexts)) {
      const contexts = { ...raw.contexts };
      for (const key of Object.keys(contexts)) {
        if (/^replays?$/i.test(key)) delete contexts[key];
        else if (object(contexts[key])) contexts[key] = withoutLinks(contexts[key]);
      }
      payload.contexts = contexts;
    }
    return [itemHeader, payload];
  });
  return [header, items] as Envelope;
}
