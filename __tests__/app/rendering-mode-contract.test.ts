import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

type Mode =
  | { kind: 'isr'; revalidate: number; onDemand?: true }
  | { kind: 'force-dynamic' }
  | { kind: 'force-static'; revalidate: number }
  | { kind: 'static-shell' }
  | { kind: 'redirect'; dynamicParam?: true }
  | { kind: 'request-api'; marker: RegExp };

const require = createRequire(import.meta.url);
const root = process.cwd();
const APP_DIR = path.join(root, 'app');

// 렌더링 모드 선언의 정본. 빌드 후 검사(scripts/verify-rendering-modes.js)도 같은 표를 쓴다.
const { MODES, PAGE_FILE, readSegmentConfig, stripComments } = require(
  path.join(root, 'scripts/rendering-modes.js'),
) as {
  MODES: Record<string, Mode>;
  PAGE_FILE: RegExp;
  readSegmentConfig: (source: string) => { dynamic: string | null; revalidate: number | null; hasStaticParams: boolean };
  stripComments: (source: string) => string;
};

function listFiles(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(path.join(dir, entry.name), relative) : [relative];
  });
}

const appFiles = listFiles(APP_DIR).filter((file) => !file.startsWith('api/'));
const pageFiles = appFiles.filter((file) => PAGE_FILE.test(file));
const layoutFiles = appFiles.filter((file) => /(^|\/)(layout|template)\.(tsx|ts|jsx|js)$/.test(file));
const read = (file: string) => fs.readFileSync(path.join(APP_DIR, file), 'utf8');

/**
 * 루트 레이아웃이 headers() 를 부르지 않으므로, 요청 시점 API 를 쓰지 않는 페이지는
 * Next 가 정적으로 렌더해 (revalidate 가 없으면) 영원히 캐시한다.
 * 모든 페이지는 scripts/rendering-modes.js 에 렌더링 모드를 선언한다 — 선언 없는 새 페이지는 이 테스트가 막는다.
 *
 * 이 테스트는 소스의 선언만 본다. 실제 빌드 결과는 postbuild 의 scripts/verify-rendering-modes.js 가 대조한다.
 */
describe('렌더링 모드 계약 (소스 선언)', () => {
  it('app 의 모든 페이지가 표에 선언돼 있다 (page.tsx 뿐 아니라 page.ts·jsx·js·mdx 도)', () => {
    expect([...pageFiles].sort()).toEqual(Object.keys(MODES).sort());
  });

  // 루트 레이아웃이 pass-through 라 app/ 바로 아래의 페이지는 <html> 을 주는 레이아웃이 없다.
  it('모든 페이지는 [lang] 또는 (bare) 아래에 있다', () => {
    expect(pageFiles.filter((file) => !file.startsWith('[lang]/') && !file.startsWith('(bare)/'))).toEqual([]);
  });

  it.each(Object.entries(MODES))('%s', (file, mode) => {
    const source = read(file);
    const code = stripComments(source);
    const config = readSegmentConfig(source);

    switch (mode.kind) {
      case 'isr':
        expect(config).toMatchObject({ dynamic: null, revalidate: mode.revalidate });
        // 동적 세그먼트([id])는 generateStaticParams 가 있어야 요청 시 생성·캐시된다.
        if (mode.onDemand) expect(config.hasStaticParams).toBe(true);
        break;
      case 'force-dynamic':
        expect(config).toMatchObject({ dynamic: 'force-dynamic', revalidate: null });
        break;
      case 'force-static':
        expect(config).toMatchObject({ dynamic: 'force-static', revalidate: mode.revalidate });
        break;
      case 'static-shell':
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        // 서버에서 데이터를 조회하지 않는 페이지만 굳어도 된다: 클라이언트 페이지이거나 await 가 없어야 한다.
        expect(/^\s*['"]use client['"]/.test(code) || !/\bawait\b/.test(code)).toBe(true);
        break;
      case 'redirect':
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        expect(code).toMatch(/\bredirect\(/);
        break;
      case 'request-api':
        // 죽은 revalidate 를 두지 않는다 — 동적 페이지에서는 효과가 없어 오해만 부른다.
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        // 타입 선언이나 주석이 아니라 실제 호출이 있어야 한다.
        expect(code).toMatch(mode.marker);
        break;
    }
  });

  // 레이아웃의 세그먼트 설정은 하위 페이지 전체의 모드를 바꾼다(예: (mypage) 레이아웃의 force-dynamic 은
  // faq·notice 의 ISR 을 조용히 끈다). 요청 시점 API 를 부르면 하위 페이지가 전부 동적이 된다.
  it.each(layoutFiles)('레이아웃 %s 는 세그먼트 설정도 요청 시점 API 도 갖지 않는다', (file) => {
    const source = read(file);
    expect(readSegmentConfig(source)).toMatchObject({ dynamic: null, revalidate: null });
    expect(stripComments(source)).not.toMatch(/from\s+['"]next\/headers['"]/);
  });

  // sitemap 은 투표·리워드·공지 조회가 실패해도 부분 결과를 돌려준다. 캐시하면 URL 이 빠진 sitemap 이
  // 한 시간 동안 굳으므로, 요청마다 렌더하는 기존 동작을 명시적으로 유지한다.
  it.each(['sitemap.ts', '[lang]/sitemap.ts'])('%s 는 요청마다 렌더한다', (file) => {
    expect(readSegmentConfig(read(file))).toMatchObject({ dynamic: 'force-dynamic', revalidate: null });
  });
});
