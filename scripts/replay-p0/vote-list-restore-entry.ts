import { emptyProjectionState, type ProjectionState } from './contract';
import { createVoteListContract, type VoteListManifest } from './contracts/vote-list';
import manifest from './contracts/vote-list.css-manifest.json';
import { projectWithContract } from './engine/envelope';
import { createReplayView } from './replay-view';

type Wire = { header: any; items: { header: any; payload: any }[] };
const encoder = new TextEncoder();
function toEnvelope(e: Wire) {
  return [e.header, e.items.map(i => i.header.type !== 'replay_recording' ? [i.header, i.payload]
    : [{ type: 'replay_recording' }, encoder.encode(JSON.stringify(i.payload.segment) + '\n' + JSON.stringify(i.payload.records))])];
}
async function decode(bytes: Uint8Array): Promise<unknown[]> {
  const text = new TextDecoder().decode(bytes); const lines = text.split('\n');
  // Envelope: header, item header, payload, item header, recording header, recording body (uncompressed input stays uncompressed).
  return JSON.parse(lines.at(-1)!);
}
const trackStyle = (records: unknown[]) => Array.from(JSON.stringify(records).matchAll(/--banner-current-index: \d+;/g)).at(-1)?.[0] ?? '';
Object.assign(window, { voteList: {
  async projectAll(envelopes: Wire[], bannerCount: number) {
    const m = manifest as VoteListManifest; const contract = createVoteListContract({ manifest: m, origin: m.generatedFrom.origin, bannerCount });
    let state: ProjectionState = emptyProjectionState(); const records: unknown[] = []; const raw: unknown[] = [];
    for (const e of envelopes) {
      raw.push(...e.items.filter(i => i.header.type === 'replay_recording').flatMap(i => i.payload.records));
      const r = await projectWithContract(toEnvelope(e) as any, state, contract);
      if (!r.ok) return { reason: r.reason };
      state = r.value.next; records.push(...await decode(r.value.bytes));
    }
    return { reason: 'ok', records, trackStyle: trackStyle(records), rawTrackStyle: trackStyle(raw) };
  },
  restore(records: unknown[], selectors: string[], tags: string[]) {
    const doc = document.querySelector('iframe')!.contentDocument!;
    const view = createReplayView(doc, { tags }); view.apply(records);
    // Scroll records flush layout mid-apply, so later class changes start CSS transitions. Measure end states.
    for (const animation of doc.getAnimations()) if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    doc.defaultView!.scrollTo(0, 0);
    const boxes = view.layout(selectors); view.dispose(); return boxes;
  },
} });
