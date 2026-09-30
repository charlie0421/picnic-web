import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

type Mode = {
  kind: 'isr' | 'force-static' | 'force-dynamic' | 'request-api' | 'static-shell' | 'redirect';
  revalidate?: number;
  onDemand?: boolean;
  dynamicParam?: boolean;
  marker?: RegExp;
};
type Manifest = {
  routes: Record<string, { initialRevalidateSeconds: number | false }>;
  dynamicRoutes: Record<string, { fallback: string | null | false }>;
};

const require = createRequire(import.meta.url);
const root = process.cwd();
const { MODES, EXTRA_PRERENDERED, routeOfFile, readSegmentConfig, stripComments } = require(
  path.join(root, 'scripts/rendering-modes.js'),
) as {
  MODES: Record<string, Mode>;
  EXTRA_PRERENDERED: Record<string, number | false>;
  routeOfFile: (file: string) => string;
  readSegmentConfig: (source: string) => { dynamic: string | null; revalidate: number | null; hasStaticParams: boolean };
  stripComments: (source: string) => string;
};
const { verifyPrerenderManifest } = require(path.join(root, 'scripts/verify-rendering-modes.js')) as {
  verifyPrerenderManifest: (manifest: Manifest, modes?: Record<string, Mode>, extra?: Record<string, number | false>) => string[];
};

const PREBUILT_LANGS = ['en', 'ko', 'my'];
const isStatic = (mode: Mode) =>
  ['isr', 'force-static', 'static-shell'].includes(mode.kind) || (mode.kind === 'redirect' && !mode.dynamicParam);
const revalidateOf = (mode: Mode) => (mode.kind === 'isr' || mode.kind === 'force-static' ? mode.revalidate! : false);

/** 선언(MODES)과 정확히 일치하는 빌드 결과를 만든다. */
const goodManifest = (): Manifest => {
  const manifest: Manifest = { routes: {}, dynamicRoutes: {} };
  for (const [pathname, revalidate] of Object.entries(EXTRA_PRERENDERED)) {
    manifest.routes[pathname] = { initialRevalidateSeconds: revalidate };
  }
  for (const [file, mode] of Object.entries(MODES)) {
    if (!isStatic(mode)) continue;
    const route = routeOfFile(file);
    if (route.includes('[')) {
      manifest.dynamicRoutes[route] = { fallback: null };
      if (mode.onDemand) continue;
      for (const lang of PREBUILT_LANGS) {
        manifest.routes[route.replace('[lang]', lang)] = { initialRevalidateSeconds: revalidateOf(mode) };
      }
    } else {
      manifest.routes[route] = { initialRevalidateSeconds: revalidateOf(mode) };
    }
  }
  return manifest;
};

describe('routeOfFile', () => {
  it.each([
    ['[lang]/page.tsx', '/[lang]'],
    ['[lang]/(main)/rewards/[id]/page.tsx', '/[lang]/rewards/[id]'],
    ['[lang]/(mypage)/mypage/qna/new/page.tsx', '/[lang]/mypage/qna/new'],
    ['(bare)/auth/loading/page.tsx', '/auth/loading'],
    ['(bare)/vote/[id]/page.tsx', '/vote/[id]'],
  ])('%s → %s', (file, route) => {
    expect(routeOfFile(file)).toBe(route);
  });
});

describe('readSegmentConfig', () => {
  it('작은따옴표·큰따옴표·세미콜론 유무와 관계없이 읽는다', () => {
    expect(readSegmentConfig(`export const dynamic = 'force-dynamic';`).dynamic).toBe('force-dynamic');
    expect(readSegmentConfig(`export const dynamic = "force-dynamic"`).dynamic).toBe('force-dynamic');
    expect(readSegmentConfig(`export const revalidate = 300;\n`).revalidate).toBe(300);
    expect(readSegmentConfig(`export const revalidate=300`).revalidate).toBe(300);
  });

  it('설정이 없으면 null 이다', () => {
    expect(readSegmentConfig(`export default function Page() { return null }`)).toEqual({
      dynamic: null,
      revalidate: null,
      hasStaticParams: false,
    });
  });

  it('주석 안의 선언은 설정이 아니다', () => {
    const source = `// export const dynamic = 'force-dynamic';\n/* export const revalidate = 60; */\nexport default function Page() {}`;
    expect(readSegmentConfig(source)).toMatchObject({ dynamic: null, revalidate: null });
  });

  // 조용히 "설정 없음"이나 다른 값으로 읽히면 계약 테스트가 거짓으로 통과한다.
  it.each([
    `export const revalidate = 60 * 5;`,
    `export const revalidate = FIVE_MINUTES;`,
    `export const revalidate = false;`,
    `export const dynamic: string = 'force-dynamic';`,
    `export const dynamic = process.env.X ? 'force-dynamic' : 'auto';`,
    `export const dynamicParams = false;`,
    `export const fetchCache = 'force-no-store';`,
    `export { dynamic } from './config';`,
    `const dynamic = 'force-dynamic';\nexport { dynamic, revalidate };`,
  ])('해석할 수 없는 형태는 예외다: %s', (source) => {
    expect(() => readSegmentConfig(source)).toThrow();
  });

  it('generateStaticParams 선언을 알아본다', () => {
    expect(readSegmentConfig(`export async function generateStaticParams() { return [] }`).hasStaticParams).toBe(true);
    expect(readSegmentConfig(`export function generateStaticParams() { return [] }`).hasStaticParams).toBe(true);
  });
});

describe('stripComments', () => {
  it('줄·블록 주석을 지우고 URL 의 // 는 남긴다', () => {
    const source = `const a = 'https://example.com/x'; // await getServerUser()\n/* await headers() */ const b = 1;`;
    const stripped = stripComments(source);
    expect(stripped).toContain(`'https://example.com/x'`);
    expect(stripped).not.toContain('getServerUser');
    expect(stripped).not.toContain('headers()');
  });
});

/**
 * 빌드 결과(.next/prerender-manifest.json)가 선언과 같은지 본다. 소스의 선언만 보는 계약 테스트는
 * "선언은 그대로인데 실제 모드가 바뀐" 경우를 잡지 못한다 — 예: 페이지가 쓰던 쿠키 조회가 사라져
 * 조용히 정적으로 굳는 경우.
 */
describe('verifyPrerenderManifest', () => {
  it('선언과 일치하는 빌드 결과에는 문제가 없다', () => {
    expect(verifyPrerenderManifest(goodManifest())).toEqual([]);
  });

  it('동적으로 선언한 페이지가 프리렌더되면 알린다 (요청 시점 API 가 사라져 굳는 경우)', () => {
    const manifest = goodManifest();
    manifest.routes['/ko/vote'] = { initialRevalidateSeconds: false };
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/\/ko\/vote/);
    expect(problems[0]).toMatch(/request-api/);
  });

  it('동적으로 선언한 페이지가 온디맨드 정적 생성 대상이 되면 알린다 (force-dynamic 이 빠진 투표 상세)', () => {
    const manifest = goodManifest();
    manifest.dynamicRoutes['/[lang]/vote/[id]'] = { fallback: null };
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/\/\[lang\]\/vote\/\[id\]/);
  });

  it('선언되지 않은 경로가 프리렌더되면 알린다 (모드 선언 없이 추가된 새 페이지)', () => {
    const manifest = goodManifest();
    manifest.routes['/ko/new-landing'] = { initialRevalidateSeconds: false };
    manifest.dynamicRoutes['/[lang]/new-landing'] = { fallback: null };
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(2);
    expect(problems.join('\n')).toMatch(/new-landing/);
  });

  it('ISR 주기가 선언과 다르면 알린다', () => {
    const manifest = goodManifest();
    manifest.routes['/ko/faq'] = { initialRevalidateSeconds: false };
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/\/ko\/faq/);
    expect(problems[0]).toMatch(/300/);
  });

  it('ISR 로 선언한 페이지가 프리렌더되지 않으면 알린다 (조용히 동적으로 바뀐 경우)', () => {
    const manifest = goodManifest();
    for (const lang of PREBUILT_LANGS) delete manifest.routes[`/${lang}/rewards`];
    delete manifest.dynamicRoutes['/[lang]/rewards'];
    const problems = verifyPrerenderManifest(manifest);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toMatch(/\/\[lang\]\/rewards/);
  });

  it('온디맨드 ISR 상세가 정적 생성 대상에서 빠지면 알린다', () => {
    const manifest = goodManifest();
    delete manifest.dynamicRoutes['/[lang]/notice/[id]'];
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/\/\[lang\]\/notice\/\[id\]/);
  });

  it('프리빌드되지 않은 언어를 404 로 만드는 설정(fallback: false)을 알린다', () => {
    const manifest = goodManifest();
    manifest.dynamicRoutes['/[lang]/faq'] = { fallback: false };
    const problems = verifyPrerenderManifest(manifest);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/\/\[lang\]\/faq/);
  });

  it('접두어 없는 /vote 는 [lang] 리다이렉트가 아니라 (bare) 스텁으로 판정한다 (정적 세그먼트 우선)', () => {
    const manifest = goodManifest();
    expect(manifest.routes['/vote']).toEqual({ initialRevalidateSeconds: false });
    expect(verifyPrerenderManifest(manifest)).toEqual([]);
  });

  // 로컬에 빌드 산출물이 있으면 실제 결과도 검증한다(빌드 후 npm 의 postbuild 가 같은 검사를 돌린다).
  const manifestPath = path.join(root, '.next/prerender-manifest.json');
  it.skipIf(!fs.existsSync(manifestPath))('현재 .next 의 빌드 결과가 선언과 일치한다', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;
    expect(verifyPrerenderManifest(manifest)).toEqual([]);
  });
});

describe('postbuild 연결', () => {
  // 검증은 next-sitemap 보다 먼저 돈다 — 모드가 어긋난 빌드로 sitemap 을 만들 이유가 없고,
  // 실패하면 빌드(=배포)가 실패해야 한다.
  it('npm run build 뒤에 빌드 결과 검증을 돌린다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.postbuild).toBe('node scripts/verify-rendering-modes.js && next-sitemap');
  });
});
