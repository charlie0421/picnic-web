// Coordinator-only build. No installation, upgrades, product route or provider imports.
import { build, version } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

// The pinned script is delivered on Node's stdin with cwd explicitly set to W.
// ESM's esbuild import and the fixed virtual TS source resolve from that root.
const root = fs.realpathSync(process.cwd());
if (root !== process.cwd() || process.argv[1] !== '-' || process.argv.length !== 4) {
  throw new Error('Bundle requires the coordinator stdin delivery interface');
}
const output = path.resolve(process.argv[2] || '');
const relative = path.relative(path.join(root, '.artifacts/payment-web-order-http'), output).split(path.sep);
if (relative.length !== 2 || !/^charge-context-[a-z0-9][a-z0-9-]{0,63}$/.test(relative[0]) || relative[1] !== 'node-artifacts'
    || fs.realpathSync(output) !== output) throw new Error('Invalid owned charge-context bundle directory');
const entry = '__tests__/integration/payment/charge-context-postgrest.http.ts';
const entryHex = process.argv[3];
if (!/^(?:[0-9a-f]{2})+$/.test(entryHex)) throw new Error('Invalid fixed-entry byte delivery');
const entryBytes = Buffer.from(entryHex, 'hex');
const contents = entryBytes.toString('utf8');
if (!Buffer.from(contents, 'utf8').equals(entryBytes)) throw new Error('Entry is not lossless UTF-8');
const result = await build({
  absWorkingDir: root,
  stdin: { contents, sourcefile: entry, resolveDir: root, loader: 'ts' },
  outfile: path.join(output, 'charge-context-http.cjs'),
  platform: 'node', target: 'node24', format: 'cjs', bundle: true,
  external: ['@supabase/supabase-js', '/fixture/guard.cjs'],
  metafile: true, sourcemap: false, logLevel: 'warning',
});
if (JSON.stringify(Object.keys(result.metafile.inputs)) !== JSON.stringify([entry])) {
  throw new Error('Bundle contains an unapproved local input');
}
const outputs = Object.values(result.metafile.outputs);
const imports = outputs.flatMap(row => row.imports);
const expectedImports = ['@supabase/supabase-js', '/fixture/guard.cjs', 'node:assert/strict', 'node:crypto', 'node:fs', 'node:http'];
if (outputs.length !== 1 || imports.some(row => !row.external)
    || JSON.stringify(imports.map(row => row.path).sort()) !== JSON.stringify(expectedImports.sort())) {
  throw new Error('Bundle contains an unapproved external dependency');
}
// Record the actual contents supplied to esbuild. Root compares these bytes
// with its pinned entry snapshot, hashes that same snapshot, and pins this file.
fs.writeFileSync(path.join(output, 'bundle-inputs.json'), JSON.stringify({ esbuildVersion: version,
  entryDeliveryHex: Buffer.from(contents, 'utf8').toString('hex'), metafile: result.metafile }, null, 2) + '\n', { flag: 'wx' });
