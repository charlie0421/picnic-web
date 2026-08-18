import { describe, it, expect } from 'vitest';
import { isAdminProfile, ADMIN_FLAG_COLUMNS } from '@/lib/auth/is-admin';

/**
 * `is_super_admin` 은 `is_admin` 의 상위 권한이고 둘이 함께 켜져 있으리라는 보장이 없다.
 * `is_admin=false, is_super_admin=true` 조합이 실재한다.
 */
describe('isAdminProfile', () => {
  it('is_admin 만 켜져 있어도 관리자다', () => {
    expect(isAdminProfile({ is_admin: true, is_super_admin: false })).toBe(true);
  });

  it('is_super_admin 만 켜져 있어도 관리자다 — 이 조합이 서버에서 강등되던 버그', () => {
    expect(isAdminProfile({ is_admin: false, is_super_admin: true })).toBe(true);
  });

  it('둘 다 켜져 있으면 관리자다', () => {
    expect(isAdminProfile({ is_admin: true, is_super_admin: true })).toBe(true);
  });

  it('둘 다 꺼져 있으면 관리자가 아니다', () => {
    expect(isAdminProfile({ is_admin: false, is_super_admin: false })).toBe(false);
  });

  it('null / undefined 는 관리자가 아니다', () => {
    expect(isAdminProfile(null)).toBe(false);
    expect(isAdminProfile(undefined)).toBe(false);
    expect(isAdminProfile({})).toBe(false);
  });

  it('DB 의 null 컬럼도 관리자가 아니다', () => {
    expect(isAdminProfile({ is_admin: null, is_super_admin: null })).toBe(false);
  });

  describe('fail-closed — boolean 이 아닌 값은 관리자가 아니다', () => {
    // 권한 원시 함수다. truthy 검사였다면 문자열 "false" 가 관리자로 열렸다.
    const cases: Array<[string, unknown]> = [
      ['문자열 "false"', 'false'],
      ['문자열 "true"', 'true'],
      ['문자열 "0"', '0'],
      ['숫자 1', 1],
      ['숫자 0', 0],
      ['빈 객체', {}],
      ['배열', []],
    ];

    for (const [label, value] of cases) {
      it(`${label} 은 관리자가 아니다`, () => {
        expect(isAdminProfile({ is_admin: value } as never)).toBe(false);
        expect(isAdminProfile({ is_super_admin: value } as never)).toBe(false);
      });
    }
  });

  it('조회 컬럼 상수가 두 플래그를 모두 포함한다 — 하나만 select 하면 판정이 무너진다', () => {
    expect(ADMIN_FLAG_COLUMNS).toBe('is_admin, is_super_admin');
    expect(
      ADMIN_FLAG_COLUMNS.split(',').map((c) => c.trim()).sort(),
    ).toEqual(['is_admin', 'is_super_admin']);
  });
});
