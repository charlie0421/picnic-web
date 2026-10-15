// Measures whether another engine's recording matches the Chromium manifest. Measurement only; it changes nothing.
// Usage: npx tsx scripts/replay-p0/tools/compare-engine-css.ts --wire-dir <dir> --engine webkit --out <json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { parseBrowserEnvelope } from '../../envelope-test/browser-analyze';
import { emptyProjectionState, type ProjectionState } from '../contract';
import { createVoteListContract, normalizeCssOrigin, type VoteListManifest } from '../contracts/vote-list';
import manifestJson from '../contracts/vote-list.css-manifest.json';
import { projectWithContract } from '../engine/envelope';

/** Top-level rules of a serialized stylesheet, whitespace-normalized. */
export function cssRules(text: string): string[] {
  return postcss.parse(text).nodes.map(n => n.toString().replace(/\s+/g, ' ').trim());
}
export function diffCssRules(engine: string, chromium: string) {
  const a = new Set(cssRules(engine)); const b = new Set(cssRules(chromium));
  const onlyEngine = Array.from(a).filter(x => !b.has(x)); const onlyChromium = Array.from(b).filter(x => !a.has(x));
  return { onlyEngine: onlyEngine.length, onlyChromium: onlyChromium.length,
    examples: { onlyEngine: onlyEngine.slice(0, 5).map(s => s.slice(0, 200)), onlyChromium: onlyChromium.slice(0, 5).map(s => s.slice(0, 200)) } };
}
function sheetResult(text: string, chromium: string[]) {
  if (chromium.indexOf(text) >= 0) return { match: true };
  try {
    const closest = chromium.map(c => diffCssRules(text, c)).sort((x, y) => (x.onlyEngine + x.onlyChromium) - (y.onlyEngine + y.onlyChromium))[0];
    return { match: false, closest };
  } catch (error) { return { match: false, parseError: String(error) }; }
}
async function main(args: string[]) {
  const get = (name: string) => { const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw new Error(`missing ${name}`); return args[i + 1]; };
  const dir = get('--wire-dir'); const engine = get('--engine'); const out = get('--out');
  const manifest = manifestJson as VoteListManifest; const origin = manifest.generatedFrom.origin;
  const chromiumText = (accept: { engine: string; text: string }[]) => accept.filter(a => a.engine === 'chromium').map(a => a.text);
  const links = manifest.linkCss.reduce<string[]>((all, c) => all.concat(chromiumText(c.accept)), []);
  const styles = manifest.styleText.reduce<string[]>((all, s) => all.concat(chromiumText(s.accept)), []);
  const result: Record<string, unknown> = { engine, origin, widths: {} };
  for (const width of [1280, 390]) {
    const files = [1, 2, 3].map(n => join(dir, `wire-${width}-${n}.bin`));
    if (!files.every(f => existsSync(f))) { (result.widths as any)[width] = { missing: true }; continue; }
    const envelopes = files.map(f => parseBrowserEnvelope(readFileSync(f)));
    const seenLinks: string[] = []; const seenStyles: string[] = [];
    for (const e of envelopes) for (const item of e.items) {
      if (item.header.type !== 'replay_recording') continue;
      JSON.stringify(item.payload.records, (k, v) => {
        if (k === '_cssText' && seenLinks.indexOf(normalizeCssOrigin(v, origin)) < 0) seenLinks.push(normalizeCssOrigin(v, origin));
        if (v && v.isStyle === true && seenStyles.indexOf(normalizeCssOrigin(v.textContent, origin)) < 0) seenStyles.push(normalizeCssOrigin(v.textContent, origin));
        return v;
      });
    }
    const contract = createVoteListContract({ manifest, origin, bannerCount: 5 });
    let state: ProjectionState = emptyProjectionState(); let outcome: { reason: string; segment: number } = { reason: 'ok', segment: 3 };
    for (let s = 0; s < 3; s++) {
      const e = envelopes[s];
      const input = [e.header, e.items.map((i: any) => i.header.type !== 'replay_recording' ? [i.header, i.payload]
        : [{ type: 'replay_recording' }, new TextEncoder().encode(JSON.stringify(i.payload.segment) + '\n' + JSON.stringify(i.payload.records))])];
      const r = await projectWithContract(input as any, state, contract);
      if (!r.ok) { outcome = { reason: r.reason, segment: s }; break; }
      state = r.value.next;
    }
    (result.widths as any)[width] = { links: seenLinks.map(t => sheetResult(t, links)), styles: seenStyles.map(t => sheetResult(t, styles)), contract: outcome };
  }
  writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
// tsx runs this file as CommonJS (package type), so import.meta is unavailable; check the entry path instead.
if (process.argv[1] && process.argv[1].endsWith('compare-engine-css.ts')) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
