import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

/**
 * 루트 레이아웃이 headers() 를 부르지 않으므로, 요청 시점 API 를 쓰지 않는 페이지는
 * Next 가 정적으로 렌더해 (revalidate 가 없으면) 영원히 캐시한다.
 * 모든 페이지는 여기에 렌더링 모드를 선언한다 — 선언 없는 새 페이지는 이 테스트가 막는다.
 */
type Mode =
  | { kind: 'isr'; revalidate: number; onDemand?: true }
  | { kind: 'force-dynamic' }
  | { kind: 'force-static'; revalidate: number }
  /** 서버 데이터가 없는 리다이렉트·클라이언트 셸. 굳어도 되는 페이지만. */
  | { kind: 'static-shell' }
  /** 페이지 파일이 직접 요청 시점 API 를 읽어 동적이다. marker 가 사라지면 다시 판단해야 한다. */
  | { kind: 'request-api'; marker: RegExp };

const LANG_DIR = path.join(process.cwd(), 'app/[lang]');

const MODES: Record<string, Mode> = {
  'page.tsx': { kind: 'static-shell' },
  '(auth)/login/page.tsx': { kind: 'static-shell' },
  '(main)/concert2025/page.tsx': { kind: 'force-static', revalidate: 86400 },
  '(main)/media/page.tsx': { kind: 'force-dynamic' },
  '(main)/privacy/page.tsx': { kind: 'force-dynamic' },
  '(main)/terms/page.tsx': { kind: 'force-dynamic' },
  '(main)/rewards/page.tsx': { kind: 'isr', revalidate: 60 },
  '(main)/rewards/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '(main)/star-candy/page.tsx': { kind: 'force-dynamic' },
  '(main)/vote/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(main)/vote/[id]/page.tsx': { kind: 'force-dynamic' },
  '(mypage)/faq/page.tsx': { kind: 'isr', revalidate: 300 },
  '(mypage)/notice/page.tsx': { kind: 'isr', revalidate: 300 },
  '(mypage)/notice/[id]/page.tsx': { kind: 'isr', revalidate: 300, onDemand: true },
  '(mypage)/mypage/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/candy-history/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/expiry-guide/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/notifications/page.tsx': { kind: 'request-api', marker: /getServerUser\(/ },
  '(mypage)/mypage/qna/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(mypage)/mypage/qna/new/page.tsx': { kind: 'static-shell' },
  '(mypage)/mypage/qna/[thread_id]/page.tsx': { kind: 'force-dynamic' },
  '(mypage)/mypage/recharge-history/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  '(mypage)/mypage/vote-history/page.tsx': { kind: 'request-api', marker: /searchParams/ },
  'download/page.tsx': { kind: 'isr', revalidate: 3600 },
  'open-in-browser/page.tsx': { kind: 'request-api', marker: /headers\(\)/ },
};

function listPages(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return listPages(path.join(dir, entry.name), relative);
    return entry.name === 'page.tsx' ? [relative] : [];
  });
}

function readConfig(source: string) {
  const dynamic = source.match(/^export const dynamic = '([a-z-]+)'/m)?.[1] ?? null;
  const revalidateRaw = source.match(/^export const revalidate = (\d+)/m)?.[1];
  return {
    dynamic,
    revalidate: revalidateRaw === undefined ? null : Number(revalidateRaw),
    hasStaticParams: /^export (async )?function generateStaticParams\(/m.test(source),
  };
}

describe('app/[lang] 렌더링 모드 계약', () => {
  it('모든 페이지가 표에 선언돼 있다', () => {
    expect(listPages(LANG_DIR).sort()).toEqual(Object.keys(MODES).sort());
  });

  it.each(Object.entries(MODES))('%s', (relative, mode) => {
    const source = fs.readFileSync(path.join(LANG_DIR, relative), 'utf8');
    const config = readConfig(source);

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
        break;
      case 'request-api':
        // 죽은 revalidate 를 두지 않는다 — 동적 페이지에서는 효과가 없어 오해만 부른다.
        expect(config).toMatchObject({ dynamic: null, revalidate: null });
        expect(source).toMatch(mode.marker);
        break;
    }
  });

  // sitemap 은 투표·리워드·공지 조회가 실패해도 부분 결과를 돌려준다. 캐시하면 URL 이 빠진 sitemap 이
  // 한 시간 동안 굳으므로, 요청마다 렌더하는 기존 동작을 명시적으로 유지한다.
  it.each(['app/sitemap.ts', 'app/[lang]/sitemap.ts'])('%s 는 요청마다 렌더한다', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(readConfig(source)).toMatchObject({ dynamic: 'force-dynamic', revalidate: null });
  });
});
