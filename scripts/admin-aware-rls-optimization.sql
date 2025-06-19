-- =============================================================================
-- 관리자 권한을 고려한 RLS 성능 최적화 스크립트
-- 목표: 성능 향상 + 관리자 기능 유지
-- =============================================================================

-- 🔧 방법 1: 캐시된 관리자 권한 체크 (추천)
-- =============================================================================

-- 기존 정책 제거
DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_admin" ON user_profiles;  
DROP POLICY IF EXISTS "user_profiles_select_public" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_admin" ON user_profiles;

-- 성능 최적화된 관리자 권한 체크 함수
CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    admin_status BOOLEAN;
    cache_key TEXT;
BEGIN
    -- 세션별 캐시 키
    cache_key := 'user_is_admin_' || COALESCE(auth.uid()::text, 'anonymous');
    
    -- 캐시에서 먼저 확인 (같은 세션 내에서 재사용)
    BEGIN
        SELECT current_setting(cache_key, true)::boolean INTO admin_status;
        IF admin_status IS NOT NULL THEN
            RETURN admin_status;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- 캐시 없음, 계속 진행
    END;
    
    -- 캐시가 없으면 DB에서 조회 (한 번만)
    SELECT COALESCE(is_admin, false)
    FROM user_profiles
    WHERE id = auth.uid()
    INTO admin_status;
    
    -- 결과를 세션에 캐싱 (같은 세션에서 재사용)
    PERFORM set_config(cache_key, admin_status::text, false);
    
    RETURN COALESCE(admin_status, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 최적화된 RLS 정책 (관리자 권한 포함)
-- ✅ SELECT: 자신 프로필 + 공개 프로필 + 관리자는 모든 프로필
CREATE POLICY "user_profiles_select_optimized" ON user_profiles
    FOR SELECT USING (
        auth.uid() = id 
        OR (auth.uid() IS NOT NULL AND deleted_at IS NULL)
        OR auth.is_admin()  -- 캐시된 관리자 체크
    );

-- ✅ UPDATE: 자신 프로필 + 관리자는 모든 프로필
CREATE POLICY "user_profiles_update_optimized" ON user_profiles
    FOR UPDATE USING (
        auth.uid() = id 
        OR auth.is_admin()  -- 캐시된 관리자 체크
    );

-- ✅ INSERT: 자신 ID + 관리자는 모든 ID
CREATE POLICY "user_profiles_insert_optimized" ON user_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id 
        OR auth.is_admin()  -- 캐시된 관리자 체크
    );

-- ✅ DELETE: 관리자만 가능
CREATE POLICY "user_profiles_delete_optimized" ON user_profiles
    FOR DELETE USING (
        auth.is_admin()  -- 캐시된 관리자 체크
    );

-- =============================================================================
-- 🚀 방법 2: 관리자 전용 RPC 함수 (대안)
-- =============================================================================

-- 관리자 전용 프로필 조회 함수
CREATE OR REPLACE FUNCTION admin_get_user_profile(target_user_id UUID)
RETURNS TABLE (
    id UUID,
    email TEXT,
    nickname TEXT,
    avatar_url TEXT,
    is_admin BOOLEAN,
    star_candy INTEGER,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    -- 관리자 권한 확인
    IF NOT auth.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- RLS 우회하여 직접 조회 (최고 성능)
    RETURN QUERY
    SELECT 
        up.id,
        up.email,
        up.nickname,
        up.avatar_url,
        up.is_admin,
        up.star_candy,
        up.created_at,
        up.updated_at,
        up.deleted_at
    FROM user_profiles up
    WHERE up.id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 관리자 전용 프로필 업데이트 함수
CREATE OR REPLACE FUNCTION admin_update_user_profile(
    target_user_id UUID,
    profile_data JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
    update_query TEXT;
    set_clauses TEXT[];
    key TEXT;
    value TEXT;
BEGIN
    -- 관리자 권한 확인
    IF NOT auth.is_admin() THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- 안전한 필드만 업데이트 허용
    FOR key, value IN SELECT * FROM jsonb_each_text(profile_data)
    LOOP
        CASE key
            WHEN 'nickname' THEN 
                set_clauses := set_clauses || (key || ' = ' || quote_literal(value));
            WHEN 'is_admin' THEN 
                set_clauses := set_clauses || (key || ' = ' || value::boolean);
            WHEN 'star_candy' THEN 
                set_clauses := set_clauses || (key || ' = ' || value::integer);
            -- 다른 안전한 필드들 추가 가능
            ELSE
                -- 허용되지 않은 필드는 무시
                CONTINUE;
        END CASE;
    END LOOP;
    
    -- 업데이트 실행
    IF array_length(set_clauses, 1) > 0 THEN
        update_query := 'UPDATE user_profiles SET ' || 
                       array_to_string(set_clauses, ', ') || 
                       ', updated_at = NOW() WHERE id = ' || quote_literal(target_user_id);
        
        EXECUTE update_query;
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 🔍 성능 최적화 인덱스
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at ON user_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- =============================================================================
-- 📋 권한 부여
-- =============================================================================

GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_profile(UUID, JSONB) TO authenticated;

-- =============================================================================
-- 🧪 테스트 쿼리
-- =============================================================================

-- 현재 사용자의 관리자 상태 확인
-- SELECT auth.is_admin();

-- 관리자용 프로필 조회 테스트 (관리자만 실행 가능)
-- SELECT * FROM admin_get_user_profile('user-id-here');

-- 일반 RLS 정책 테스트
-- SELECT * FROM user_profiles WHERE id = auth.uid();

-- =============================================================================
-- 📊 성능 비교
-- =============================================================================

/*
방법 1 (캐시된 RLS 정책):
✅ 장점: 기존 코드 변경 없음, 자동 권한 적용
⚠️ 단점: 여전히 RLS 오버헤드 존재

방법 2 (관리자 RPC 함수):
✅ 장점: 최고 성능, RLS 완전 우회
⚠️ 단점: 관리자 기능에서 코드 수정 필요

추천: 방법 1로 시작 → 필요시 방법 2로 전환
*/

-- =============================================================================
-- 🔒 보안 고려사항
-- =============================================================================

/*
✅ 유지되는 보안:
- 일반 사용자: 자신의 프로필만 수정 가능
- 관리자: 모든 프로필 접근 가능
- 삭제된 프로필은 일반 사용자에게 보이지 않음

✅ 개선된 점:
- 관리자 권한 체크가 세션 내에서 캐싱됨
- N+1 쿼리 문제 해결
- 서브쿼리 제거로 성능 향상

⚠️ 주의사항:
- 관리자 권한 변경 시 세션 재시작 필요 (캐시 초기화)
- RPC 함수는 SECURITY DEFINER로 실행됨
*/ 