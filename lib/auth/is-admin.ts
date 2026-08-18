/**
 * 관리자 판정 단일 출처.
 *
 * `is_super_admin` 은 `is_admin` 의 상위 권한이고, 둘이 함께 켜져 있으리라는 보장이 없다.
 * `is_admin=false, is_super_admin=true` 인 계정이 실재한다
 * (`__tests__/api/wallet-history-admin-guard.test.ts:51` 이 이 형태를 다룬다).
 *
 * 이 판정이 레포에 흩어져 복사돼 있었고, 그중
 * `lib/data-fetching/server/safe-operations.ts` 의 사본만 `is_admin` 단독을 보고 있어
 * super-admin 전용 계정이 서버에서 조용히 강등됐다. 사본을 늘리지 말고 이 함수를 쓸 것.
 *
 * `=== true` 로만 인정한다. truthy 검사(`!!(a || b)`)는 문자열 `"false"`·`"0"` 같은
 * 비-boolean 값을 관리자로 열어준다. 지금 경로는 PostgREST 가 boolean/null 을 주지만,
 * 이건 권한 원시 함수라 스키마 드리프트·직렬화된 프로필·잘못된 mock 이 들어와도
 * fail-closed 여야 한다.
 */
export interface AdminFlags {
  is_admin?: boolean | null;
  is_super_admin?: boolean | null;
}

export const isAdminProfile = (profile?: AdminFlags | null): boolean =>
  profile?.is_admin === true || profile?.is_super_admin === true;

/** 프로필 조회 시 관리자 판정에 필요한 최소 컬럼. */
export const ADMIN_FLAG_COLUMNS = 'is_admin, is_super_admin';
