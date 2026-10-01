import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const routesDir = path.join(root, 'app/api/envelope-test');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(root, full)];
  });

describe('envelope 테스트용 라우트', () => {
  // readdir 의 순서는 파일시스템마다 다르다(CI 의 ext4 는 정렬해 주지 않는다).
  const files = walk(routesDir).sort();
  const routeFiles = files.filter((file) => path.basename(file).startsWith('route.'));

  it('보통 빌드가 라우트로 읽는 이름의 파일이 없다', () => {
    // 보통 빌드의 pageExtensions 는 tsx·ts·jsx·js 다. route.envtest.ts 만 있어야 한다.
    expect(routeFiles).toEqual([
      'app/api/envelope-test/edge-throw/route.envtest.ts',
      'app/api/envelope-test/handled/route.envtest.ts',
      'app/api/envelope-test/throw/route.envtest.ts',
    ]);
    expect(files.filter((file) => /(^|\/)(page|layout|route)\.(tsx|ts|jsx|js)$/.test(file))).toEqual([]);
  });

  it('모든 라우트가 ENVELOPE_TEST 를 런타임에서도 확인한다', () => {
    for (const file of routeFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source, file).toContain('envelopeTestDisabled()');
    }
    const helper = fs.readFileSync(path.join(routesDir, '_lib/envtest.ts'), 'utf8');
    expect(helper).toContain("process.env.ENVELOPE_TEST === '1'");
  });

  it('비밀처럼 보이는 값을 코드에 두지 않는다 — 실행기가 요청 헤더로 넘긴다', () => {
    for (const file of files) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/cnry|eyJ/);
    }
  });
});

describe('envelope 테스트 시나리오', () => {
  const { CANARIES, EXPECTED, REPEAT, buildRequests } = require(
    path.join(root, 'scripts/envelope-test/scenario.js'),
  ) as {
    CANARIES: Record<'absent' | 'stdoutOnly' | 'unhandled', Record<string, string>>;
    EXPECTED: { errors: Array<{ count: number }>; transactions: Array<{ min: number }> };
    REPEAT: number;
    buildRequests: (base: string) => Array<{ label: string; url: string; init: { headers: Record<string, string>; body?: string } }>;
  };

  it('canary 값이 서로 겹치지 않는다', () => {
    const values = Object.values(CANARIES).flatMap((group) => Object.values(group));
    for (const value of values) {
      expect(values.filter((other) => other.includes(value)), value).toHaveLength(1);
    }
  });

  it('모든 canary 가 요청 어딘가에 실린다', () => {
    const sent = JSON.stringify(buildRequests('http://127.0.0.1:3000'));
    for (const value of Object.values(CANARIES).flatMap((group) => Object.values(group))) {
      expect(sent, value).toContain(value);
    }
  });

  it('종류마다 REPEAT 번 보내고, 기대 건수가 그와 같다', () => {
    const requests = buildRequests('http://127.0.0.1:3000');
    const labels = [...new Set(requests.map((request) => request.label))];
    expect(labels).toEqual(['page', 'webhook', 'handled', 'throw', 'edge-throw']);
    for (const label of labels) {
      expect(requests.filter((request) => request.label === label)).toHaveLength(REPEAT);
    }
    for (const rule of EXPECTED.errors) expect(rule.count).toBe(REPEAT);
    for (const rule of EXPECTED.transactions) expect(rule.min).toBe(REPEAT);
  });

  it('package.json 에 실행 스크립트가 있다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:envelope']).toBe('node scripts/envelope-test/run.js');
  });
});
