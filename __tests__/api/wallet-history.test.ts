import { describe, it, expect } from 'vitest';
import * as routeModule from '@/app/api/user/wallet/history/route';

// Next.js Route Handler는 HTTP 메서드/route segment config 외의 export를 허용하지 않는다.
// normalizeHistoryError가 route.ts에 남아있으면 npm run build가 실패한다(회귀 방지 테스트).
describe('app/api/user/wallet/history/route exports', () => {
  it('GET 핸들러만 export 한다', () => {
    expect(typeof routeModule.GET).toBe('function');
  });
  it('normalizeHistoryError 는 더 이상 route 파일에서 export 되지 않는다', () => {
    expect((routeModule as Record<string, unknown>).normalizeHistoryError).toBeUndefined();
  });
});
