-- Supabase 리얼타임 설정 진단 스크립트
-- 이 스크립트를 Supabase 대시보드의 SQL Editor에서 실행하여 리얼타임 설정 상태를 확인하세요.

-- 1. 현재 Publication 목록 확인
SELECT 
    pubname as publication_name,
    pubowner,
    puballtables,
    pubinsert,
    pubupdate,
    pubdelete,
    pubtruncate
FROM pg_publication;

-- 2. supabase_realtime publication에 포함된 테이블 확인
SELECT 
    p.pubname as publication_name,
    t.schemaname,
    t.tablename
FROM pg_publication p
JOIN pg_publication_tables t ON p.pubname = t.pubname
WHERE p.pubname = 'supabase_realtime'
ORDER BY t.schemaname, t.tablename;

-- 3. 투표 관련 테이블이 publication에 포함되어 있는지 확인
SELECT 
    table_name,
    CASE 
        WHEN table_name IN (
            SELECT tablename 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        ) THEN 'YES ✅'
        ELSE 'NO ❌'
    END as in_realtime_publication
FROM (
    VALUES 
        ('vote'), 
        ('vote_item'), 
        ('vote_pick'), 
        ('artist_vote'), 
        ('artist_vote_item')
) AS tables(table_name);

-- 4. 테이블이 존재하는지 확인
SELECT 
    table_name,
    CASE 
        WHEN table_name IN (
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
        ) THEN 'EXISTS ✅'
        ELSE 'NOT FOUND ❌'
    END as table_exists
FROM (
    VALUES 
        ('vote'), 
        ('vote_item'), 
        ('vote_pick'), 
        ('artist_vote'), 
        ('artist_vote_item')
) AS tables(table_name);

-- 5. 트리거 함수가 존재하는지 확인
SELECT 
    routine_name as function_name,
    routine_type,
    CASE 
        WHEN routine_name IN (
            'update_vote_item_totals',
            'update_artist_vote_item_totals', 
            'update_vote_status',
            'notify_vote_update'
        ) THEN 'EXISTS ✅'
        ELSE 'OTHER'
    END as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN (
    'update_vote_item_totals',
    'update_artist_vote_item_totals', 
    'update_vote_status',
    'notify_vote_update'
);

-- 6. 트리거가 활성화되어 있는지 확인
SELECT 
    t.tgname as trigger_name,
    c.relname as table_name,
    t.tgenabled as enabled,
    CASE 
        WHEN t.tgenabled = 'O' THEN 'ENABLED ✅'
        WHEN t.tgenabled = 'D' THEN 'DISABLED ❌'
        ELSE 'UNKNOWN'
    END as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND t.tgname IN (
    'trigger_update_vote_item_totals',
    'trigger_update_vote_status',
    'trigger_notify_vote_update'
);

-- 7. RLS 정책 확인 (리얼타임이 작동하려면 올바른 RLS 설정이 필요)
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('vote', 'vote_item', 'vote_pick')
ORDER BY tablename, policyname;

-- 8. 투표 데이터 샘플 확인 (테스트용)
SELECT 'vote 테이블 샘플' as table_info;
SELECT id, title, start_at, stop_at, created_at 
FROM vote 
WHERE id = 83 
LIMIT 1;

-- 9. vote_item 샘플 확인
SELECT 'vote_item 테이블 샘플' as table_info;
SELECT id, vote_id, artist_id, group_id, vote_total, updated_at
FROM vote_item 
WHERE vote_id = 83 
LIMIT 5;

-- 10. vote_pick 샘플 확인
SELECT 'vote_pick 테이블 샘플' as table_info;
SELECT id, vote_id, vote_item_id, user_id, amount, updated_at
FROM vote_pick 
WHERE vote_id = 83 
LIMIT 5;



-- 9. 리얼타임 테스트를 위한 권장사항
SELECT '=== 🔧 리얼타임 진단 완료 ===' as diagnosis_complete;
SELECT 'publication에 테이블이 없다면 다음 명령을 실행하세요:' as recommendation;
SELECT 'ALTER PUBLICATION supabase_realtime ADD TABLE vote, vote_item, vote_pick;' as fix_command; 