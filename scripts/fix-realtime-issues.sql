-- Supabase 리얼타임 문제 해결 스크립트 (vote_item 테이블만)
-- 이 스크립트를 Supabase 대시보드의 SQL Editor에서 실행하여 리얼타임 문제를 해결하세요.

-- ==========================================
-- 1. Publication에 vote_item 테이블만 추가
-- ==========================================

-- supabase_realtime publication이 존재하는지 확인하고 없으면 생성
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
    RAISE NOTICE 'Created supabase_realtime publication';
  ELSE
    RAISE NOTICE 'supabase_realtime publication already exists';
  END IF;
END $$;

-- vote_item 테이블을 publication에 추가 (이미 있으면 무시)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE vote_item;
    RAISE NOTICE 'Added vote_item table to publication';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'vote_item table already in publication';
  END;
END $$;

SELECT 'Publication 설정 완료 - vote_item만' as status;

-- ==========================================
-- 2. vote_item 테이블 RLS 정책 (읽기 허용)
-- ==========================================

-- vote_item 테이블 RLS 정책 (읽기 허용)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vote_item' AND policyname = 'Enable read access for all users'
  ) THEN
    CREATE POLICY "Enable read access for all users" ON "public"."vote_item"
    AS PERMISSIVE FOR SELECT
    TO public
    USING (true);
    RAISE NOTICE 'Created RLS policy for vote_item table';
  ELSE
    RAISE NOTICE 'RLS policy for vote_item table already exists';
  END IF;
END $$;

SELECT 'RLS 정책 설정 완료 - vote_item만' as status;

-- ==========================================
-- 3. 리얼타임 테스트 함수 생성 (vote_item만)
-- ==========================================

-- 리얼타임 테스트를 위한 함수
CREATE OR REPLACE FUNCTION test_realtime_update(vote_id_param INTEGER)
RETURNS TEXT AS $$
DECLARE
  test_vote_item_id INTEGER;
  result_text TEXT;
BEGIN
  -- 해당 투표의 첫 번째 vote_item 찾기
  SELECT id INTO test_vote_item_id
  FROM vote_item 
  WHERE vote_id = vote_id_param 
  LIMIT 1;
  
  IF test_vote_item_id IS NULL THEN
    RETURN 'Error: No vote_item found for vote_id ' || vote_id_param;
  END IF;
  
  -- vote_item의 updated_at 필드 업데이트 (리얼타임 이벤트 발생)
  UPDATE vote_item 
  SET updated_at = NOW()
  WHERE id = test_vote_item_id;
  
  result_text := 'Test realtime update sent for vote_item ' || test_vote_item_id || ' (vote_id: ' || vote_id_param || ')';
  
  RAISE NOTICE '%', result_text;
  
  RETURN result_text;
END;
$$ LANGUAGE plpgsql;

SELECT 'Test 함수 생성 완료' as status;

-- ==========================================
-- 4. 최종 확인
-- ==========================================

-- Publication에 테이블이 제대로 추가되었는지 확인
SELECT 
    'supabase_realtime publication 테이블 목록:' as info,
    string_agg(tablename, ', ') as tables
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' AND schemaname = 'public';

-- 완료 메시지
SELECT '🎉 리얼타임 설정이 완료되었습니다! (vote_item만)' as result;
SELECT '테스트 방법:' as info;
SELECT '1. 브라우저에서 window.testSupabaseRealtime() 실행' as step1;
SELECT '2. SQL에서 SELECT test_realtime_update(83); 실행' as step2; 