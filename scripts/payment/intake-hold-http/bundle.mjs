// The root delivers this script on stdin and the entry bytes as hex. No installation and no network.
import { build, version } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = fs.realpathSync(process.cwd());
if (root !== process.cwd() || process.argv[1] !== '-' || process.argv.length !== 4) {
  throw new Error('Expected root stdin build interface');
}
const out = path.resolve(process.argv[2]);
const parts = path.relative(path.join(root, '.artifacts/payment-web-order-http'), out).split(path.sep);
if (parts.length !== 2 || !/^intake-hold-[a-z0-9][a-z0-9-]{0,63}$/.test(parts[0])
    || parts[1] !== 'node-artifacts' || fs.realpathSync(out) !== out) throw new Error('Invalid owned build directory');
const entry = '__tests__/integration/payment/intake-hold-postgrest.http.ts';
const hex = process.argv[3];
if (!/^(?:[0-9a-f]{2})+$/.test(hex)) throw new Error('Invalid entry byte snapshot');
const bytes = Buffer.from(hex, 'hex');
const contents = bytes.toString('utf8');
if (!Buffer.from(contents, 'utf8').equals(bytes)) throw new Error('Lossy entry UTF-8');
// Exact transitive source closure. Type-only imports are erased and are not inputs.
const allowed = new Set([entry, 'server-only-marker:server-only',
  ...['binding-source', 'durability-contract', 'orchestrator', 'protocol', 'provider-entry', 'read-cycle',
    'reconciliation-executor', 'reconciliation-repository', 'repository', 'submission-classification', 'transport']
    .map(name => `lib/payment/paypal-charge/${name}.ts`)]);
const result = await build({
  absWorkingDir: root,
  stdin: { contents, sourcefile: path.basename(entry), resolveDir: path.dirname(path.join(root, entry)), loader: 'ts' },
  outfile: path.join(out, 'intake-hold-http.cjs'),
  bundle: true, platform: 'node', format: 'cjs', target: 'node24',
  external: ['@supabase/supabase-js', '/fixture/guard.cjs'],
  metafile: true, sourcemap: false, logLevel: 'warning',
  plugins: [{ name: 'server-only-fixture-marker', setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'server-only-marker' }));
    build.onLoad({ filter: /.*/, namespace: 'server-only-marker' }, () => ({ contents: '', loader: 'js' }));
  } }],
});
const actual = Object.keys(result.metafile.inputs);
if (actual.length !== allowed.size || actual.some(name => !allowed.has(name))) {
  throw new Error('Unexpected actual bundle input graph; root review required: ' + JSON.stringify(actual));
}
const outputs = Object.values(result.metafile.outputs);
const external = outputs.flatMap(value => value.imports);
const allowedExternal = new Set(['@supabase/supabase-js', '/fixture/guard.cjs', 'node:assert/strict', 'node:crypto', 'node:fs']);
if (outputs.length !== 1 || external.some(row => !row.external || !allowedExternal.has(row.path))
    || new Set(external.map(row => row.path)).size !== allowedExternal.size) {
  throw new Error('Unexpected bundle external graph: ' + JSON.stringify(external.map(row => row.path)));
}
fs.writeFileSync(path.join(out, 'bundle-inputs.json'), JSON.stringify({ esbuildVersion: version,
  entryDeliveryHex: Buffer.from(contents, 'utf8').toString('hex'), metafile: result.metafile }, null, 2) + '\n', { flag: 'wx' });
