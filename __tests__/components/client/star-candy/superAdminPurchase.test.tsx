import { describe, it, expect } from 'vitest';
import { isAdminProfile } from '@/lib/auth/is-admin';

/**
 * 클라이언트 관리자 판정 통일 회귀 방지.
 *
 * 아래 6곳이 `is_admin` 단독을 보고 있어 super-admin 전용 계정이 일반 사용자로 취급됐다:
 *   PicnicMenu, StarCandyProductsPresenter, MobileNavigationMenu,
 *   MobilePortalMenu, PortalMenuItem, useMenu
 * 가장 눈에 띄는 증상은 StarCandyProductsPresenter 의 구매 버튼 비활성화였다.
 * 여섯 곳 모두 이제 lib/auth/is-admin.ts 의 판정을 쓴다.
 */
describe('클라이언트 관리자 판정', () => {
  it('super-admin 전용 계정을 관리자로 인정한다', () => {
    expect(isAdminProfile({ is_admin: false, is_super_admin: true })).toBe(true);
  });

  it('일반 관리자도 인정한다', () => {
    expect(isAdminProfile({ is_admin: true, is_super_admin: false })).toBe(true);
  });

  it('일반 사용자는 아니다', () => {
    expect(isAdminProfile({ is_admin: false, is_super_admin: false })).toBe(false);
  });

  it('프로필 로딩 전(null/undefined)은 관리자가 아니다', () => {
    expect(isAdminProfile(null)).toBe(false);
    expect(isAdminProfile(undefined)).toBe(false);
  });

  it('truthy 문자열을 관리자로 열지 않는다 — 이전 StarCandy 판정은 || false 라 fail-open 이었다', () => {
    expect(isAdminProfile({ is_admin: 'false' } as never)).toBe(false);
    expect(isAdminProfile({ is_admin: '0' } as never)).toBe(false);
  });
});
