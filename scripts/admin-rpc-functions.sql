-- =====================================
-- 관리자용 RPC 함수 구현
-- =====================================
-- 목적: RLS 정책과 함께 사용할 관리자 전용 RPC 함수들
-- 작성일: 2024년
-- 참조: docs/admin-rpc-functions.md

-- =====================================
-- 1. 기본 유틸리티 함수들
-- =====================================

-- 1.1 관리자 권한 확인 함수 (이미 존재하는 경우 업데이트)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
DECLARE
    current_user_id uuid;
    admin_count integer;
BEGIN
    -- 현재 사용자 ID 확인
    current_user_id := auth.uid();
    
    -- 인증되지 않은 경우 false 반환
    IF current_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    -- admin_user_roles 테이블에서 관리자 권한 확인
    SELECT COUNT(*)
    INTO admin_count
    FROM admin_user_roles aur
    JOIN admin_roles ar ON aur.role_id = ar.id
    WHERE aur.user_id = current_user_id::text
      AND aur.deleted_at IS NULL
      AND ar.deleted_at IS NULL;
    
    RETURN admin_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1.2 특정 권한 확인 함수
CREATE OR REPLACE FUNCTION has_admin_permission(permission_name text)
RETURNS boolean AS $$
DECLARE
    current_user_id uuid;
    permission_count integer;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN false;
    END IF;
    
    SELECT COUNT(*)
    INTO permission_count
    FROM admin_user_roles aur
    JOIN admin_role_permissions arp ON aur.role_id = arp.role_id
    JOIN admin_permissions ap ON arp.permission_id = ap.id
    WHERE aur.user_id = current_user_id::text
      AND ap.action = permission_name
      AND aur.deleted_at IS NULL
      AND arp.deleted_at IS NULL;
    
    RETURN permission_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 2. 사용자 관리 함수들
-- =====================================

-- 2.1 사용자 목록 조회
CREATE OR REPLACE FUNCTION admin_get_user_list(
    limit_count integer DEFAULT 50,
    offset_count integer DEFAULT 0,
    search_term text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    users_data jsonb;
    total_count integer;
    has_more boolean;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 전체 사용자 수 계산
    SELECT COUNT(*)
    INTO total_count
    FROM user_profiles up
    WHERE up.deleted_at IS NULL
      AND (search_term IS NULL OR 
           up.email ILIKE '%' || search_term || '%' OR 
           up.nickname ILIKE '%' || search_term || '%');
    
    -- 사용자 목록 조회
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', up.id,
            'email', up.email,
            'nickname', up.nickname,
            'star_candy', COALESCE(up.star_candy, 0),
            'star_candy_bonus', COALESCE(up.star_candy_bonus, 0),
            'created_at', up.created_at,
            'updated_at', up.updated_at,
            'is_admin', CASE WHEN aur.user_id IS NOT NULL THEN true ELSE false END,
            'vote_count', COALESCE(vote_stats.vote_count, 0),
            'total_spent', COALESCE(vote_stats.total_spent, 0)
        )
    )
    INTO users_data
    FROM user_profiles up
    LEFT JOIN admin_user_roles aur ON up.id = aur.user_id AND aur.deleted_at IS NULL
    LEFT JOIN (
        SELECT 
            vp.user_id,
            COUNT(*) as vote_count,
            SUM(vp.amount) as total_spent
        FROM vote_pick vp
        WHERE vp.deleted_at IS NULL
        GROUP BY vp.user_id
    ) vote_stats ON up.id = vote_stats.user_id
    WHERE up.deleted_at IS NULL
      AND (search_term IS NULL OR 
           up.email ILIKE '%' || search_term || '%' OR 
           up.nickname ILIKE '%' || search_term || '%')
    ORDER BY up.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
    
    -- has_more 계산
    has_more := (offset_count + limit_count) < total_count;
    
    RETURN jsonb_build_object(
        'users', COALESCE(users_data, '[]'::jsonb),
        'total_count', total_count,
        'has_more', has_more
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.2 사용자 상세 정보 조회
CREATE OR REPLACE FUNCTION admin_get_user_detail(user_id uuid)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    user_profile jsonb;
    user_statistics jsonb;
    recent_activity jsonb;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 사용자 프로필 조회
    SELECT jsonb_build_object(
        'id', up.id,
        'email', up.email,
        'nickname', up.nickname,
        'star_candy', COALESCE(up.star_candy, 0),
        'star_candy_bonus', COALESCE(up.star_candy_bonus, 0),
        'created_at', up.created_at,
        'updated_at', up.updated_at
    )
    INTO user_profile
    FROM user_profiles up
    WHERE up.id = user_id::text AND up.deleted_at IS NULL;
    
    IF user_profile IS NULL THEN
        RAISE EXCEPTION '사용자를 찾을 수 없습니다.';
    END IF;
    
    -- 사용자 통계 조회
    SELECT jsonb_build_object(
        'total_votes', COALESCE(COUNT(vp.id), 0),
        'total_spent', COALESCE(SUM(vp.amount), 0),
        'last_vote_date', MAX(vp.created_at)
    )
    INTO user_statistics
    FROM vote_pick vp
    WHERE vp.user_id = user_id::text AND vp.deleted_at IS NULL;
    
    -- 최근 활동 조회
    SELECT jsonb_agg(
        jsonb_build_object(
            'type', 'VOTE',
            'description', '투표 참여',
            'amount', vp.amount,
            'created_at', vp.created_at
        )
    )
    INTO recent_activity
    FROM vote_pick vp
    WHERE vp.user_id = user_id::text AND vp.deleted_at IS NULL
    ORDER BY vp.created_at DESC
    LIMIT 10;
    
    RETURN jsonb_build_object(
        'profile', user_profile,
        'statistics', user_statistics,
        'recent_activity', COALESCE(recent_activity, '[]'::jsonb)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2.3 사용자 캔디 조정
CREATE OR REPLACE FUNCTION admin_update_user_candy(
    target_user_id uuid,
    candy_amount integer,
    reason text
)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    current_candy integer;
    new_candy integer;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 현재 캔디 양 조회
    SELECT COALESCE(star_candy, 0)
    INTO current_candy
    FROM user_profiles
    WHERE id = target_user_id::text AND deleted_at IS NULL;
    
    IF current_candy IS NULL THEN
        RAISE EXCEPTION '사용자를 찾을 수 없습니다.';
    END IF;
    
    -- 회수 시 잔액 확인
    IF candy_amount < 0 AND current_candy < ABS(candy_amount) THEN
        RAISE EXCEPTION '회수할 캔디 양이 현재 잔액보다 많습니다. 현재 잔액: %', current_candy;
    END IF;
    
    -- 새로운 캔디 양 계산
    new_candy := current_candy + candy_amount;
    
    -- 사용자 캔디 업데이트
    UPDATE user_profiles
    SET star_candy = new_candy,
        updated_at = NOW()
    WHERE id = target_user_id::text;
    
    -- 캔디 히스토리 기록
    INSERT INTO candy_history (
        user_id,
        type,
        amount,
        description,
        admin_user_id,
        created_at
    ) VALUES (
        target_user_id::text,
        CASE WHEN candy_amount > 0 THEN 'GIFT' ELSE 'ADMIN_ADJUSTMENT' END,
        candy_amount,
        reason,
        current_user_id::text,
        NOW()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'previous_amount', current_candy,
        'new_amount', new_candy,
        'change_amount', candy_amount,
        'reason', reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 3. 투표 관리 함수들
-- =====================================

-- 3.1 투표 목록 조회
CREATE OR REPLACE FUNCTION admin_get_vote_list(
    status_filter text DEFAULT 'all',
    limit_count integer DEFAULT 20,
    offset_count integer DEFAULT 0
)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    votes_data jsonb;
    summary_data jsonb;
    current_time timestamp;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    current_time := NOW();
    
    -- 투표 목록 조회
    WITH vote_stats AS (
        SELECT 
            v.id,
            COUNT(DISTINCT vp.user_id) as total_participants,
            COALESCE(SUM(vp.amount), 0) as total_candy_spent,
            COUNT(vp.id) as total_votes
        FROM vote v
        LEFT JOIN vote_pick vp ON v.id = vp.vote_id AND vp.deleted_at IS NULL
        WHERE v.deleted_at IS NULL
        GROUP BY v.id
    ),
    filtered_votes AS (
        SELECT v.*, vs.*,
            CASE 
                WHEN current_time < v.start_at THEN 'upcoming'
                WHEN current_time BETWEEN v.start_at AND v.stop_at THEN 'active'
                ELSE 'ended'
            END as status
        FROM vote v
        JOIN vote_stats vs ON v.id = vs.id
        WHERE v.deleted_at IS NULL
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', fv.id,
            'title', fv.title,
            'area', fv.area,
            'vote_category', fv.vote_category,
            'start_at', fv.start_at,
            'stop_at', fv.stop_at,
            'total_votes', fv.total_votes,
            'total_participants', fv.total_participants,
            'total_candy_spent', fv.total_candy_spent,
            'status', fv.status
        )
    )
    INTO votes_data
    FROM filtered_votes fv
    WHERE (status_filter = 'all' OR fv.status = status_filter)
    ORDER BY fv.created_at DESC
    LIMIT limit_count
    OFFSET offset_count;
    
    -- 요약 통계 생성
    WITH vote_summary AS (
        SELECT 
            COUNT(*) as total_count,
            COUNT(CASE WHEN current_time BETWEEN start_at AND stop_at THEN 1 END) as active_count,
            COUNT(CASE WHEN current_time >= stop_at THEN 1 END) as ended_count,
            COUNT(CASE WHEN current_time < start_at THEN 1 END) as upcoming_count
        FROM vote
        WHERE deleted_at IS NULL
    )
    SELECT jsonb_build_object(
        'total_count', vs.total_count,
        'active_count', vs.active_count,
        'ended_count', vs.ended_count,
        'upcoming_count', vs.upcoming_count
    )
    INTO summary_data
    FROM vote_summary vs;
    
    RETURN jsonb_build_object(
        'votes', COALESCE(votes_data, '[]'::jsonb),
        'summary', summary_data
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3.2 투표 상세 정보 조회
CREATE OR REPLACE FUNCTION admin_get_vote_detail(vote_id integer)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    vote_info jsonb;
    vote_items jsonb;
    vote_statistics jsonb;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 투표 기본 정보 조회
    SELECT jsonb_build_object(
        'id', v.id,
        'title', v.title,
        'vote_content', v.vote_content,
        'area', v.area,
        'vote_category', v.vote_category,
        'vote_sub_category', v.vote_sub_category,
        'start_at', v.start_at,
        'stop_at', v.stop_at,
        'visible_at', v.visible_at,
        'main_image', v.main_image,
        'result_image', v.result_image,
        'wait_image', v.wait_image
    )
    INTO vote_info
    FROM vote v
    WHERE v.id = vote_id AND v.deleted_at IS NULL;
    
    IF vote_info IS NULL THEN
        RAISE EXCEPTION '투표를 찾을 수 없습니다.';
    END IF;
    
    -- 투표 아이템 조회 (순위 포함)
    WITH item_stats AS (
        SELECT 
            vi.id,
            vi.vote_total,
            a.name as artist_name,
            ag.name as group_name,
            ROW_NUMBER() OVER (ORDER BY vi.vote_total DESC) as rank
        FROM vote_item vi
        LEFT JOIN artist a ON vi.artist_id = a.id
        LEFT JOIN artist_group ag ON vi.group_id = ag.id
        WHERE vi.vote_id = vote_id AND vi.deleted_at IS NULL
    ),
    total_votes AS (
        SELECT SUM(vote_total) as total FROM item_stats
    )
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', ist.id,
            'artist_name', ist.artist_name,
            'group_name', ist.group_name,
            'vote_total', COALESCE(ist.vote_total, 0),
            'percentage', CASE 
                WHEN tv.total > 0 THEN ROUND((COALESCE(ist.vote_total, 0)::numeric / tv.total::numeric) * 100, 1)
                ELSE 0 
            END,
            'rank', ist.rank
        )
    )
    INTO vote_items
    FROM item_stats ist
    CROSS JOIN total_votes tv
    ORDER BY ist.rank;
    
    -- 투표 통계 조회
    SELECT jsonb_build_object(
        'total_votes', COALESCE(COUNT(vp.id), 0),
        'total_participants', COUNT(DISTINCT vp.user_id),
        'total_candy_spent', COALESCE(SUM(vp.amount), 0),
        'average_vote_per_user', CASE 
            WHEN COUNT(DISTINCT vp.user_id) > 0 
            THEN ROUND(COUNT(vp.id)::numeric / COUNT(DISTINCT vp.user_id)::numeric, 1)
            ELSE 0 
        END
    )
    INTO vote_statistics
    FROM vote_pick vp
    WHERE vp.vote_id = vote_id AND vp.deleted_at IS NULL;
    
    RETURN jsonb_build_object(
        'vote_info', vote_info,
        'items', COALESCE(vote_items, '[]'::jsonb),
        'statistics', vote_statistics
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 4. 통계 및 리포트 함수들
-- =====================================

-- 4.1 대시보드 통계
CREATE OR REPLACE FUNCTION admin_get_dashboard_stats(
    date_from date DEFAULT NULL,
    date_to date DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
    user_stats jsonb;
    vote_stats jsonb;
    period_start date;
    period_end date;
BEGIN
    -- 인증 및 권한 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 기본 기간 설정 (지난 30일)
    period_start := COALESCE(date_from, CURRENT_DATE - INTERVAL '30 days');
    period_end := COALESCE(date_to, CURRENT_DATE);
    
    -- 사용자 통계
    SELECT jsonb_build_object(
        'total_users', (
            SELECT COUNT(*) 
            FROM user_profiles 
            WHERE deleted_at IS NULL
        ),
        'new_users_period', (
            SELECT COUNT(*) 
            FROM user_profiles 
            WHERE deleted_at IS NULL 
              AND created_at::date BETWEEN period_start AND period_end
        ),
        'active_users_period', (
            SELECT COUNT(DISTINCT user_id) 
            FROM vote_pick 
            WHERE deleted_at IS NULL 
              AND created_at::date BETWEEN period_start AND period_end
        ),
        'total_candy_balance', (
            SELECT COALESCE(SUM(star_candy + star_candy_bonus), 0) 
            FROM user_profiles 
            WHERE deleted_at IS NULL
        )
    )
    INTO user_stats;
    
    -- 투표 통계
    SELECT jsonb_build_object(
        'total_votes', (
            SELECT COUNT(*) 
            FROM vote 
            WHERE deleted_at IS NULL
        ),
        'active_votes', (
            SELECT COUNT(*) 
            FROM vote 
            WHERE deleted_at IS NULL 
              AND NOW() BETWEEN start_at AND stop_at
        ),
        'total_participants_period', (
            SELECT COUNT(DISTINCT user_id) 
            FROM vote_pick 
            WHERE deleted_at IS NULL 
              AND created_at::date BETWEEN period_start AND period_end
        ),
        'total_candy_spent_period', (
            SELECT COALESCE(SUM(amount), 0) 
            FROM vote_pick 
            WHERE deleted_at IS NULL 
              AND created_at::date BETWEEN period_start AND period_end
        )
    )
    INTO vote_stats;
    
    RETURN jsonb_build_object(
        'period', jsonb_build_object(
            'from', period_start,
            'to', period_end
        ),
        'user_stats', user_stats,
        'vote_stats', vote_stats
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================
-- 5. 권한 설정
-- =====================================

-- 모든 함수에 대한 실행 권한 부여
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION has_admin_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_list(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_user_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_user_candy(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_vote_list(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_vote_detail(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_get_dashboard_stats(date, date) TO authenticated;

-- =====================================
-- 6. 코멘트 추가
-- =====================================

COMMENT ON FUNCTION is_admin() IS '현재 사용자의 관리자 권한 확인';
COMMENT ON FUNCTION has_admin_permission(text) IS '특정 권한 보유 여부 확인';
COMMENT ON FUNCTION admin_get_user_list(integer, integer, text) IS '관리자용 사용자 목록 조회 (페이지네이션, 검색 지원)';
COMMENT ON FUNCTION admin_get_user_detail(uuid) IS '특정 사용자의 상세 정보 및 통계 조회';
COMMENT ON FUNCTION admin_update_user_candy(uuid, integer, text) IS '사용자 스타 캔디 조정 (지급/회수)';
COMMENT ON FUNCTION admin_get_vote_list(text, integer, integer) IS '관리자용 투표 목록 조회 (상태 필터 지원)';
COMMENT ON FUNCTION admin_get_vote_detail(integer) IS '특정 투표의 상세 정보 및 통계 조회';
COMMENT ON FUNCTION admin_get_dashboard_stats(date, date) IS '관리자 대시보드용 핵심 통계 조회'; 