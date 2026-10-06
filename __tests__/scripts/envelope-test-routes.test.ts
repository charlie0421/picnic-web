import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = process.cwd();
const sourceDir = path.join(root, 'scripts/envelope-test/routes');
const targetDir = path.join(root, 'app/api/envelope-test');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [path.relative(root, full)];
  });

describe('envelope 테스트용 라우트', () => {
  // readdir 의 순서는 파일시스템마다 다르다(CI 의 ext4 는 정렬해 주지 않는다).
  const files = walk(sourceDir).sort();
  const routeFiles = files.filter((file) => path.basename(file) === 'route.ts');

  it('원본은 라우트가 아닌 자리에 있고, 저장소의 app/ 에는 테스트용 라우트가 없다', () => {
    expect(routeFiles).toEqual([
      'scripts/envelope-test/routes/boundary-handled/route.ts',
      'scripts/envelope-test/routes/boundary-hostile/route.ts',
      'scripts/envelope-test/routes/boundary-redirect/route.ts',
      'scripts/envelope-test/routes/boundary-self-throw/route.ts',
      'scripts/envelope-test/routes/boundary-stateful/route.ts',
      'scripts/envelope-test/routes/boundary-throw/route.ts',
      'scripts/envelope-test/routes/delivery-control/route.ts',
      'scripts/envelope-test/routes/delivery-plain/route.ts',
      'scripts/envelope-test/routes/delivery-safe/route.ts',
      'scripts/envelope-test/routes/edge-throw/route.ts',
      'scripts/envelope-test/routes/handled/route.ts',
      'scripts/envelope-test/routes/throw/route.ts',
    ]);
    // 실행기가 테스트 빌드 동안만 복사해 둔다. 여기에 남아 있으면 보통 빌드에 들어간다.
    expect(fs.existsSync(targetDir), 'app/api/envelope-test 가 남아 있다. 지운다').toBe(false);
  });

  it('실행기가 원본을 복사하고, 빌드가 끝나면 지운다', () => {
    const { TEST_ROUTE_SOURCE, TEST_ROUTE_TARGET } = require(path.join(root, 'scripts/envelope-test/build-switch.js')) as {
      TEST_ROUTE_SOURCE: string;
      TEST_ROUTE_TARGET: string;
    };
    expect(path.join(root, TEST_ROUTE_SOURCE)).toBe(sourceDir);
    expect(path.join(root, TEST_ROUTE_TARGET)).toBe(targetDir);

    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    expect(runner).toMatch(/installTestRoutes\(\);\s+routesInstalled = true;\s+try \{\s+await build\(\);\s+\} finally \{\s+removeTestRoutes\(\);/);
  });

  it('모든 라우트가 ENVELOPE_TEST 를 런타임에서도 확인한다', () => {
    for (const file of routeFiles) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source, file).toContain('envelopeTestDisabled()');
    }
    const helper = fs.readFileSync(path.join(sourceDir, '_lib/envtest.ts'), 'utf8');
    expect(helper).toContain("process.env.ENVELOPE_TEST === '1'");
  });

  it('비밀처럼 보이는 값을 코드에 두지 않는다 — 실행기가 요청 헤더로 넘긴다', () => {
    for (const file of files) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toMatch(/cnry|eyJ/);
    }
  });

  it('경계를 시험하는 라우트만 withSafeErrors 로 내보낸다', () => {
    const wrapped = routeFiles.filter((file) => /export const GET = withSafeErrors\('envtest\.[a-z_.]+',/.test(fs.readFileSync(path.join(root, file), 'utf8')));
    expect(wrapped).toEqual([
      'scripts/envelope-test/routes/boundary-handled/route.ts',
      'scripts/envelope-test/routes/boundary-hostile/route.ts',
      'scripts/envelope-test/routes/boundary-redirect/route.ts',
      'scripts/envelope-test/routes/boundary-self-throw/route.ts',
      'scripts/envelope-test/routes/boundary-stateful/route.ts',
      'scripts/envelope-test/routes/boundary-throw/route.ts',
      'scripts/envelope-test/routes/delivery-safe/route.ts',
    ]);
    // 나머지는 감싸지 않은 채로 둔다. 감싸지 않은 라우트의 동작(미처리 오류, flush 한계)을 고정하는 것이 목적이다.
    for (const file of routeFiles.filter((route) => !wrapped.includes(route))) {
      expect(fs.readFileSync(path.join(root, file), 'utf8'), file).not.toContain('with-safe-errors');
    }
  });
});

describe('envelope 테스트 시나리오', () => {
  const { CANARIES, EXPECTED, KEPT, REPEAT, buildRequests } = require(
    path.join(root, 'scripts/envelope-test/scenario.js'),
  ) as {
    CANARIES: Record<'absent' | 'stdoutOnly' | 'unhandled', Record<string, string>>;
    EXPECTED: {
      errors: Array<{ count: number }>;
      errorFree: Array<{ label: string; transaction: string }>;
      transactions: Array<{ min: number; name: string }>;
      traceHeaders: Array<{ min: number }>;
      stdout: Array<{ count: number; includes: string }>;
    };
    KEPT: { userId: string; orderId: string };
    REPEAT: number;
    buildRequests: (base: string) => Array<{
      label: string;
      url: string;
      init: { headers: Record<string, string>; body?: string };
      expect?: { status: number; json?: unknown; location?: string; body?: string; cookie?: { name: string; value: string } };
    }>;
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
    expect(labels).toEqual(['page', 'webhook', 'handled', 'throw', 'edge-throw', 'boundary-throw', 'boundary-handled', 'boundary-hostile', 'boundary-self-throw', 'boundary-redirect', 'boundary-stateful-1', 'boundary-stateful-2']);
    for (const label of labels) {
      expect(requests.filter((request) => request.label === label)).toHaveLength(REPEAT);
    }
    for (const rule of EXPECTED.errors) expect(rule.count).toBe(REPEAT);
    for (const rule of EXPECTED.transactions) expect(rule.min).toBe(REPEAT);
    for (const rule of EXPECTED.traceHeaders) expect(rule.min).toBe(REPEAT);
    for (const rule of EXPECTED.stdout) expect(rule.count).toBe(REPEAT);
  });

  it('남아야 하는 값은 계약의 형식을 통과하고 canary 와 겹치지 않는다', () => {
    expect(KEPT.userId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(KEPT.orderId).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    const sent = JSON.stringify(buildRequests('http://127.0.0.1:3000'));
    for (const value of Object.values(KEPT)) {
      expect(sent, value).toContain(value);
      expect(value).not.toMatch(/cnry/i);
    }
  });

  it('가린 로그 줄의 기대가 테스트 라우트가 쓰는 사건 코드를 가리킨다', () => {
    const sources = walk(sourceDir)
      .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
      .join('\n');
    for (const rule of EXPECTED.stdout) {
      const code = rule.includes.replace('ERROR: ', '');
      expect(sources, code).toContain(`'${code}'`);
    }
  });

  it('경계로 감싼 라우트의 요청은 응답 기대를 싣고, 실행기가 응답을 판정에 넘긴다', () => {
    const expectations = Object.fromEntries(
      buildRequests('http://127.0.0.1:3000')
        .filter((request) => request.label.startsWith('boundary-'))
        .map((request) => [request.label, request.expect]),
    );
    const safe500 = { status: 500, json: { error: 'Internal server error' } };
    const statefulRedirect = {
      status: 307,
      location: '/api/envelope-test/redirected',
      body: '',
      cookie: { name: 'envtest-boundary', value: 'kept' },
    };
    expect(expectations).toEqual({
      'boundary-throw': safe500,
      'boundary-handled': { status: 200, json: { ok: true } },
      'boundary-hostile': safe500,
      'boundary-self-throw': safe500,
      'boundary-redirect': { status: 307, location: '/api/envelope-test/redirected', body: '' },
      'boundary-stateful-1': statefulRedirect,
      'boundary-stateful-2': statefulRedirect,
    });

    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    // redirect 를 따라가면 307 과 Location 을 볼 수 없다.
    expect(runner).toContain("fetch(request.url, { redirect: 'manual', ...request.init })");
    expect(runner).toMatch(
      /responses\.push\(\{\s*label: request\.label,\s*url: request\.url,\s*status: response\.status,\s*location: response\.headers\.get\('location'\),\s*setCookies: response\.headers\.getSetCookie\(\),\s*body,\s*expect: request\.expect,\s*\}\);/,
    );
    expect(runner).toMatch(/evaluate\(\{[^}]*\bresponses,\s*\}\)/);
  });

  it('redirect 를 올려보내는 라우트는 실제 redirect() 를 쓰고, 그 요청에는 오류 이벤트도 transaction 도 기대하지 않는다', () => {
    const route = fs.readFileSync(path.join(sourceDir, 'boundary-redirect/route.ts'), 'utf8');
    expect(route).toContain("import { redirect } from 'next/navigation';");
    expect(route).toContain("redirect('/api/envelope-test/redirected');");
    // 판정에 쓰지 않는 message 를 읽으면 던진다.
    expect(route).toMatch(/Object\.defineProperty\(signal as object, 'message', \{\s*get\(\) \{\s*throw new Error\(/);

    const transaction = 'GET /api/envelope-test/boundary-redirect';
    expect(EXPECTED.errorFree).toContainEqual({ label: '올려보낸 redirect 신호', transaction });
    // SDK 는 3xx 응답의 transaction 을 버린다.
    expect(EXPECTED.transactions.map((rule) => rule.name)).not.toContain(transaction);
  });

  it('읽을 때마다 달라지는 신호의 라우트는 실제 redirect() 와 cookies() 를 쓰고, 두 요청 모두 오류 이벤트를 기대하지 않는다', () => {
    const route = fs.readFileSync(path.join(sourceDir, 'boundary-stateful/route.ts'), 'utf8');
    expect(route).toContain("import { cookies } from 'next/headers';");
    expect(route).toContain("import { redirect } from 'next/navigation';");
    // 쿠키는 redirect 앞에서 쓴다. 신호 객체에 싣지 않는다.
    expect(route).toMatch(/\(await cookies\(\)\)\.set\('envtest-boundary', 'kept', \{ path: '\/' \}\);\s+try \{\s+redirect\('\/api\/envelope-test\/redirected'\);/);
    expect(route).not.toContain('mutableCookies');
    // digest 는 처음 몇 번만 redirect 의 것이다.
    expect(route).toMatch(/Object\.defineProperty\(hostile, 'digest', \{\s*get\(\) \{\s*reads \+= 1;\s*return reads <= validReads \? real : /);

    const urls = buildRequests('http://127.0.0.1:3000')
      .filter((request) => request.label.startsWith('boundary-stateful-'))
      .map((request) => new URL(request.url));
    expect([...new Set(urls.map((url) => `${url.pathname} reads=${url.searchParams.get('reads')}`))]).toEqual([
      '/api/envelope-test/boundary-stateful reads=1',
      '/api/envelope-test/boundary-stateful reads=2',
    ]);

    const transaction = 'GET /api/envelope-test/boundary-stateful';
    expect(EXPECTED.errorFree).toContainEqual({ label: '읽을 때마다 달라지는 redirect 신호', transaction });
    expect(EXPECTED.errorFree).toHaveLength(2);
    expect(EXPECTED.transactions.map((rule) => rule.name)).not.toContain(transaction);
  });

  it('전달 시나리오의 요청이 실제 테스트 라우트를 가리킨다', () => {
    const { STEPS } = require(path.join(root, 'scripts/envelope-test/delivery.js')) as { STEPS: Array<{ path: string }> };
    for (const step of STEPS) {
      const route = step.path.split('?')[0].replace('/api/envelope-test/', '');
      expect(fs.existsSync(path.join(sourceDir, route, 'route.ts')), step.path).toBe(true);
    }
  });

  it('실행기가 두 시나리오를 모두 돌린다', () => {
    const runner = fs.readFileSync(path.join(root, 'scripts/envelope-test/run.js'), 'utf8');
    expect(runner).toContain("if (only !== 'delivery') codes.push(await runLeak(track));");
    expect(runner).toContain("if (only !== 'leak') codes.push(await runDeliveryScenario(track));");
  });

  it('package.json 에 실행 스크립트가 있다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['test:envelope']).toBe('node scripts/envelope-test/run.js');
  });
});
