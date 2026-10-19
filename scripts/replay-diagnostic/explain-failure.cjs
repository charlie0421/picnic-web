'use strict';
// Synthetic CI evidence only. Never print or persist the raw recording input.
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('esbuild');
async function explainFailure(page) {
  const serialized = await page.evaluate(() => JSON.stringify(window.__replayCloseProbe || [], (_, value) =>
    value instanceof Map ? { probeMap: [...value] } : value instanceof Set ? { probeSet: [...value] }
      : value instanceof Uint8Array ? { probeBytes: [...value] } : value));
  const events = JSON.parse(serialized, (_, value) => {
    if (!value || typeof value !== 'object') return value;
    if (Object.hasOwn(value, 'probeMap')) return new Map(value.probeMap);
    if (Object.hasOwn(value, 'probeSet')) return new Set(value.probeSet);
    if (Object.hasOwn(value, 'probeBytes')) return Uint8Array.from(value.probeBytes);
    return value;
  });
  const summary = events.map(({ failedInput, ...event }) => event);
  const failed = events.find(event => event.failedInput?.state.nextSegment === 0);
  if (!failed) return { events: summary };
  const bundle = await build({
    stdin: { contents: "export {projectWithContract} from './scripts/replay-p0/engine/envelope'; export {createVoteListContract} from './scripts/replay-p0/contracts/vote-list';", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'synthetic-rejection-stack', setup(builder) {
      builder.onLoad({ filter: /engine\/envelope\.ts$/ }, args => ({ loader: 'ts',
        contents: fs.readFileSync(args.path, 'utf8').replace('} catch (error) { return {', '} catch (error) { return { trace: String(error.stack),'),
      }));
    } }],
  });
  const module = { exports: {} };
  new Function('module', 'exports', 'require', bundle.outputFiles[0].text)(module, module.exports, require);
  const { input, state, origin, bannerCount } = failed.failedInput;
  const manifest = JSON.parse(fs.readFileSync(path.resolve('lib/sentry/replay/generated/diagnostic-manifest.json'), 'utf8'));
  const result = await module.exports.projectWithContract(input, state, module.exports.createVoteListContract({ manifest, origin, bannerCount }));
  const frames = [...String(result.trace).matchAll(/<anonymous>:(\d+):/g)];
  const line = Number(frames[1]?.[1]);
  const source = Number.isFinite(line) ? bundle.outputFiles[0].text.split('\n').slice(Math.max(0, line - 5), line + 1) : [];
  return { events: summary, projection: { ok: result.ok, reason: result.reason, trace: result.trace, source } };
}
module.exports = { explainFailure };
