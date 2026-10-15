// __tests__/scripts/replay-p0/vote-list/engine-boundary.test.ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(__dirname, '../../../../scripts/replay-p0/engine');
describe('engine boundary', () => {
  it('has no contract-specific names', () => {
    const files = readdirSync(dir).filter(f => f.endsWith('.ts'));
    expect(files.sort()).toEqual(['envelope.ts', 'nodes.ts', 'records.ts', 'style.ts', 'types.ts', 'values.ts']);
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const word of ['banner', 'fixture', 'sdk-contract', "'div'", "'button'", 'vote-list', 'replay-p0-local']) {
        expect(src.includes(word), `${f} contains ${word}`).toBe(false);
      }
    }
  });
});
