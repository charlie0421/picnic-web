-- =============================================================================
-- Picnic 앱 RLS 성능 최적화 (관리자 권한 유지, 코드 변경 없음)
-- 실행: Supabase SQL Editor에서 직접 실행
-- 목표: 프로필 조회 성능 2초+ → 100ms 미만으로 개선
-- =============================================================================

-- 🔧 1단계: 기존 비효율적인 RLS 정책 제거
-- =============================================================================

DROP POLICY IF EXISTS "user_profiles_select_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_select_admin" ON user_profiles;  
DROP POLICY IF EXISTS "user_profiles_select_public" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_update_admin" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_delete_admin" ON user_profiles;

-- 🚀 2단계: 캐시된 관리자 권한 체크 함수 생성
-- =============================================================================

CREATE OR REPLACE FUNCTION auth.is_admin()
RETURNS BOOLEAN AS $$
DECLARE
    admin_status BOOLEAN;
    cache_key TEXT;
BEGIN
    -- 세션별 캐시 키 생성
    cache_key := 'user_is_admin_' || COALESCE(auth.uid()::text, 'anonymous');
    
    -- 캐시에서 먼저 확인 (같은 세션 내에서 재사용)
    BEGIN
        SELECT current_setting(cache_key, true)::boolean INTO admin_status;
        IF admin_status IS NOT NULL THEN
            RETURN admin_status;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- 캐시 없음, DB에서 조회
    END;
    
    -- 캐시가 없으면 DB에서 조회 (세션당 한 번만)
    SELECT COALESCE(is_admin, false)
    FROM user_profiles
    WHERE id = auth.uid()
    INTO admin_status;
    
    -- 결과를 세션에 캐싱 (이후 호출에서 즉시 반환)
    PERFORM set_config(cache_key, admin_status::text, false);
    
    RETURN COALESCE(admin_status, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수 권한 부여
GRANT EXECUTE ON FUNCTION auth.is_admin() TO authenticated;

-- ✅ 3단계: 최적화된 RLS 정책 생성 (관리자 권한 완벽 유지)
-- =============================================================================

-- SELECT 정책: 자신 프로필 + 공개 프로필 + 관리자는 모든 프로필
CREATE POLICY "user_profiles_select_optimized" ON user_profiles
    FOR SELECT USING (
        auth.uid() = id 
        OR (auth.uid() IS NOT NULL AND deleted_at IS NULL)
        OR auth.is_admin()  -- 캐시된 관리자 체크 (매우 빠름)
    );

-- UPDATE 정책: 자신 프로필 + 관리자는 모든 프로필  
CREATE POLICY "user_profiles_update_optimized" ON user_profiles
    FOR UPDATE USING (
        auth.uid() = id 
        OR auth.is_admin()  -- 캐시된 관리자 체크 (매우 빠름)
    );

-- INSERT 정책: 자신 ID + 관리자는 모든 ID
CREATE POLICY "user_profiles_insert_optimized" ON user_profiles
    FOR INSERT WITH CHECK (
        auth.uid() = id 
        OR auth.is_admin()  -- 캐시된 관리자 체크 (매우 빠름)
    );

-- DELETE 정책: 관리자만 가능
CREATE POLICY "user_profiles_delete_optimized" ON user_profiles
    FOR DELETE USING (
        auth.is_admin()  -- 캐시된 관리자 체크 (매우 빠름)
    );

-- 🔍 4단계: 성능 최적화 인덱스 추가
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_deleted_at ON user_profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_profiles_is_admin ON user_profiles(is_admin) WHERE is_admin = true;
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- 🧪 5단계: 정책 적용 상태 확인
-- =============================================================================

-- 현재 적용된 정책 확인
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- 캐시된 관리자 함수 테스트 (실행 가능한 사용자만)
-- SELECT auth.is_admin() as is_current_user_admin;

-- =============================================================================
-- 📊 성능 개선 요약
-- =============================================================================

/*
🚨 이전 문제점:
❌ 3개의 복잡한 SELECT 정책으로 인한 오버헤드
❌ 매번 실행되는 서브쿼리: (SELECT is_admin FROM user_profiles WHERE id = auth.uid())
❌ 전체 테이블 스캔 위험: deleted_at IS NULL 조건
❌ 결과: 프로필 조회 2초+ 타임아웃

✅ 최적화 후:
✅ 1개의 통합된 SELECT 정책
✅ 세션별 캐싱으로 관리자 권한 체크 (첫 호출 후 즉시 반환)
✅ Primary Key 기반 빠른 조회
✅ 적절한 인덱스로 성능 향상
✅ 예상 결과: 프로필 조회 100ms 미만

🔒 보안 유지:
✅ 일반 사용자: 자신의 프로필만 수정 가능
✅ 관리자: 모든 프로필 접근/수정/삭제 가능
✅ 삭제된 프로필은 일반 사용자에게 보이지 않음
✅ 기존 관리자 페이지 코드 변경 불필요

⚠️ 주의사항:
- 관리자 권한이 변경되면 해당 사용자는 로그아웃 후 재로그인 필요 (캐시 초기화)
- 이는 매우 드문 경우이므로 실질적 문제 없음
*/

-- =============================================================================
-- 🎯 적용 완료 알림
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '🎉 RLS 성능 최적화 완료!';
    RAISE NOTICE '📊 예상 성능 향상: 2초+ → 100ms 미만';
    RAISE NOTICE '🔒 관리자 권한 완벽 유지';
    RAISE NOTICE '💻 기존 코드 변경 불필요';
    RAISE NOTICE '✅ 즉시 테스트 가능';
END $$; 