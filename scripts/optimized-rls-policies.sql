-- Picnic Application - 최적화된 RLS 정책
-- 기존 성능 문제 해결을 위한 단순하고 효율적인 정책

-- =====================================================
-- 1. USER_PROFILES TABLE - 최적화된 RLS 정책
-- =====================================================

-- 기존 정책 제거
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_public" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_admin" ON user_profiles;

-- ✅ 단순하고 효율적인 SELECT 정책 (하나로 통합)
CREATE POLICY "user_profiles_select_optimized" ON user_profiles
    FOR SELECT USING (
        -- 자신의 프로필이거나 삭제되지 않은 프로필
        auth.uid() = id 
        OR (auth.uid() IS NOT NULL AND deleted_at IS NULL)
    );

-- ✅ 단순한 UPDATE 정책
CREATE POLICY "user_profiles_update_optimized" ON user_profiles
    FOR UPDATE USING (
        auth.uid() = id  -- 자신의 프로필만 수정 가능
    );

-- ✅ 단순한 INSERT 정책
CREATE POLICY "user_profiles_insert_optimized" ON user_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id  -- 자신의 ID로만 생성 가능
    );

-- ✅ DELETE는 soft delete만 허용 (deleted_at 업데이트)
-- 실제 DELETE는 불필요하므로 정책 없음

-- =====================================================
-- 2. 관리자 권한이 필요한 경우 - 별도 정책
-- =====================================================

-- 관리자 전용 테이블 또는 RPC 함수로 처리
-- RLS 정책에서 서브쿼리 제거하여 성능 향상

-- =====================================================
-- 3. 인덱스 최적화 (성능 향상)
-- =====================================================

-- user_profiles 테이블 인덱스 확인/생성
CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at ON user_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- =====================================================
-- 4. 성능 최적화를 위한 Helper Function
-- =====================================================

-- 관리자 권한 체크를 위한 캐시된 함수
CREATE OR REPLACE FUNCTION auth.is_admin_cached()
RETURNS BOOLEAN AS $$
DECLARE
    admin_status BOOLEAN;
BEGIN
    -- 세션 내에서 결과 캐싱
    SELECT COALESCE(
        current_setting('app.user_is_admin', true)::boolean,
        false
    ) INTO admin_status;
    
    -- 캐시된 값이 없으면 DB에서 조회 후 캐싱
    IF admin_status IS NULL OR admin_status = false THEN
        SELECT COALESCE(is_admin, false)
        FROM user_profiles
        WHERE id = auth.uid()
        INTO admin_status;
        
        -- 세션에 캐싱
        PERFORM set_config('app.user_is_admin', admin_status::text, false);
    END IF;
    
    RETURN admin_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. 프로필 조회 최적화를 위한 RPC 함수
-- =====================================================

-- 단일 사용자 프로필 조회 (RLS 우회하여 성능 향상)
CREATE OR REPLACE FUNCTION get_user_profile(user_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    nickname TEXT,
    avatar_url TEXT,
    is_admin BOOLEAN,
    star_candy INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- 자신의 프로필만 조회 가능
    IF auth.uid() != user_id THEN
        RAISE EXCEPTION 'Access denied: Can only view own profile';
    END IF;
    
    RETURN QUERY
    SELECT 
        up.id,
        up.email,
        up.nickname,
        up.avatar_url,
        up.is_admin,
        up.star_candy,
        up.created_at,
        up.updated_at
    FROM user_profiles up
    WHERE up.id = user_id
    AND up.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 6. 권한 부여
-- =====================================================

GRANT EXECUTE ON FUNCTION get_user_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION auth.is_admin_cached() TO authenticated;

-- =====================================================
-- 7. 기존 정책과 성능 비교
-- =====================================================

/*
기존 정책 문제점:
1. 3개의 SELECT 정책으로 복잡한 조건 평가
2. 매번 서브쿼리로 is_admin 체크 (N+1 문제)
3. deleted_at IS NULL로 전체 테이블 스캔

최적화된 정책 장점:
1. 단일 SELECT 정책으로 단순화
2. 서브쿼리 제거하여 N+1 문제 해결
3. 인덱스 최적화로 성능 향상
4. RPC 함수로 직접 프로필 조회 가능

예상 성능 향상:
- 프로필 조회: 2초+ → 50ms 미만
- DB 쿼리 수: 3-5개 → 1개
- 인덱스 활용도: 향상
*/

-- =====================================================
-- 8. 마이그레이션 후 확인사항
-- =====================================================

/*
적용 후 확인:
1. EXPLAIN ANALYZE로 쿼리 실행 계획 확인
2. 프로필 조회 응답 시간 측정
3. 인덱스 사용 여부 확인
4. RLS 정책 충돌 없는지 확인

테스트 쿼리:
SELECT * FROM user_profiles WHERE id = auth.uid();
SELECT get_user_profile(auth.uid());
*/ 