// Run only by the coordinator with a sanitized environment; no npm install.
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const output = path.resolve(process.argv[2] || '');
const allowed = path.join(root, '.artifacts/payment-web-order-http/');
if (!output.startsWith(allowed) || path.basename(output) !== 'node-artifacts') {
  throw new Error('Bundle output must be the owned Node artifact directory');
}
const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(root, '__tests__/integration/payment/orders-postgrest.http.ts')],
  outfile: path.join(output, 'orders-http.cjs'),
  platform: 'node', target: 'node24', format: 'cjs', bundle: true,
  external: ['next/server', '@supabase/supabase-js', '/fixture/network-guard.cjs'],
  metafile: true, sourcemap: false, logLevel: 'warning',
  plugins: [{ name: 'synthetic-auth-boundary', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/supabase\/server$/ }, () => ({ path: path.join(root, 'scripts/payment/order-http/auth-fixture.ts') }));
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: 'empty-server-only', namespace: 'fixture-marker' }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture-marker' }, () => ({ contents: '', loader: 'js' }));
    builder.onResolve({ filter: /^@\// }, args => builder.resolve('./' + args.path.slice(2), { resolveDir: root, kind: args.kind }));
  } }],
});
fs.writeFileSync(path.join(output, 'bundle-inputs.json'), JSON.stringify(result.metafile, null, 2) + '\n', { flag: 'wx' });
