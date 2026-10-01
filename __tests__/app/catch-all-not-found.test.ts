import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * matcher 가 제외하는 디렉터리와 api/ 아래의 없는 경로는 middleware 를 거치지 않는다.
 * catch-all handler 가 없으면 /images/rewards 같은 주소가 [lang]=images 로 렌더되고 ISR 항목이 된다.
 * public/ 파일과 실제 route 는 Next 가 동적 route 보다 먼저 맞추므로 영향을 받지 않는다.
 */
const DIRECTORIES = ['api', 'images', 'locales', 'favicon', 'concert2025'] as const;

describe('catch-all 404 handler', () => {
  it.each(DIRECTORIES)('app/%s/[...slug]/route.ts 의 GET 은 404 텍스트다', async (directory) => {
    const { GET } = await import(`@/app/${directory}/[...slug]/route`);
    const res: Response = await GET();
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('Not Found');
  });

  it.each(['favicon.ico', 'apple-touch-icon.png', 'apple-touch-icon-precomposed.png'])(
    'public/%s 가 있다 (브라우저가 스스로 요청하는 루트 아이콘)',
    (file) => {
      const stat = fs.statSync(path.join(process.cwd(), 'public', file));
      expect(stat.size).toBeGreaterThan(0);
    },
  );
});
