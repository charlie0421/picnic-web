import { describe, it, expect, vi } from 'vitest';
import { Suspense, type ReactElement } from 'react';

vi.mock('@/app/actions/qna', () => ({ createQnaThreadAction: vi.fn() }));
vi.mock('@/components/client/qna/AttachmentPicker', () => ({ default: () => null }));
vi.mock('@/hooks/useWithdrawalGuard', () => ({ useWithdrawalGuard: () => vi.fn() }));
vi.mock('@/hooks/useLanguage', () => ({ useLanguage: () => ({ currentLanguage: 'ko' }) }));
vi.mock('@/hooks/useTranslations', () => ({ useTranslations: () => ({ tDynamic: (key: string) => key }) }));

import NewQnaPage from '@/app/[lang]/(mypage)/mypage/qna/new/page';

/**
 * 이 페이지는 서버 데이터가 없는 클라이언트 페이지라 정적으로 프리렌더된다.
 * useSearchParams() 를 쓰는 본문이 Suspense 밖에 있으면 next build 가 실패한다.
 */
describe('/mypage/qna/new — 프리렌더 안전성', () => {
  it('default export 는 훅을 쓰지 않고 Suspense 경계를 반환한다', () => {
    const element = (NewQnaPage as () => ReactElement)();
    expect(element.type).toBe(Suspense);
  });
});
