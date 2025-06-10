# 관리자용 RPC 함수 문서

> **📚 문서 정보**  
> 작성일: 2024년  
> 목적: RLS(Row-Level Security) 정책과 함께 사용할 관리자 전용 RPC 함수들  
> 대상: 어드민 프로젝트 개발팀  

## 🔐 보안 개요

이 문서는 관리자 권한이 필요한 작업을 위한 PostgreSQL 함수들을 정의합니다. 모든 함수는 RLS 정책과 호환되며, 내부적으로 관리자 권한 검증을 수행합니다.

### 권한 검증 시스템
- `auth.uid()`: 현재 인증된 사용자 ID 확인
- `is_admin()`: 관리자 여부 확인 함수 
- `admin_user_roles`: 관리자 역할 테이블을 통한 세밀한 권한 제어

---

## 📋 함수 목록

### 1. 사용자 관리 함수

#### 1.1 `admin_get_user_list(limit_count, offset_count, search_term)`
**목적**: 사용자 목록을 관리자용으로 조회

**매개변수**:
- `limit_count` (integer): 페이지당 조회할 사용자 수 (기본값: 50)
- `offset_count` (integer): 건너뛸 사용자 수 (기본값: 0)  
- `search_term` (text, 선택사항): 이메일/닉네임 검색어

**반환값**: 사용자 목록 및 메타데이터
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "nickname": "사용자닉네임",
      "star_candy": 1000,
      "star_candy_bonus": 500,
      "created_at": "2024-01-01T00:00:00Z",
      "last_login": "2024-01-15T12:00:00Z",
      "is_admin": false,
      "vote_count": 25,
      "total_spent": 5000
    }
  ],
  "total_count": 1250,
  "has_more": true
}
```

**권한**: `ADMIN` 역할 필요

**사용 예시**:
```javascript
const { data, error } = await supabase.rpc('admin_get_user_list', {
  limit_count: 20,
  offset_count: 0,
  search_term: 'john@example.com'
});
```

---

#### 1.2 `admin_get_user_detail(user_id)`
**목적**: 특정 사용자의 상세 정보 조회

**매개변수**:
- `user_id` (uuid): 조회할 사용자 ID

**반환값**: 사용자 상세 정보
```json
{
  "profile": {
    "id": "uuid",
    "email": "user@example.com", 
    "nickname": "사용자닉네임",
    "star_candy": 1000,
    "star_candy_bonus": 500,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  },
  "statistics": {
    "total_votes": 25,
    "total_spent": 5000,
    "favorite_artist": "아티스트명",
    "last_vote_date": "2024-01-15T10:30:00Z"
  },
  "recent_activity": [
    {
      "type": "VOTE",
      "description": "투표 참여",
      "amount": 100,
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**권한**: `ADMIN` 역할 필요

---

#### 1.3 `admin_update_user_candy(user_id, candy_amount, reason)`
**목적**: 사용자의 스타 캔디 조정 (지급/회수)

**매개변수**:
- `user_id` (uuid): 대상 사용자 ID
- `candy_amount` (integer): 조정할 캔디 양 (양수: 지급, 음수: 회수)
- `reason` (text): 조정 사유

**반환값**: 작업 결과
```json
{
  "success": true,
  "previous_amount": 1000,
  "new_amount": 1500,
  "change_amount": 500,
  "reason": "이벤트 보상"
}
```

**권한**: `ADMIN` 역할 필요

**제약사항**:
- 회수 시 사용자의 현재 잔액보다 많이 회수할 수 없음
- 모든 조정 내역은 `candy_history` 테이블에 기록됨

---

#### 1.4 `admin_set_user_admin_status(user_id, is_admin, role_name)`
**목적**: 사용자에게 관리자 권한 부여/회수

**매개변수**:
- `user_id` (uuid): 대상 사용자 ID
- `is_admin` (boolean): 관리자 여부 (true: 부여, false: 회수)
- `role_name` (text, 선택사항): 관리자 역할명 (기본값: 'ADMIN')

**반환값**: 권한 변경 결과
```json
{
  "success": true,
  "user_id": "uuid",
  "previous_admin": false,
  "new_admin": true,
  "role_assigned": "ADMIN"
}
```

**권한**: `SUPER_ADMIN` 역할 필요

---

### 2. 투표 관리 함수

#### 2.1 `admin_get_vote_list(status_filter, limit_count, offset_count)`
**목적**: 모든 투표 목록을 관리자용으로 조회

**매개변수**:
- `status_filter` (text, 선택사항): 투표 상태 필터 ('active', 'ended', 'upcoming', 'all')
- `limit_count` (integer): 페이지당 조회할 투표 수 (기본값: 20)
- `offset_count` (integer): 건너뛸 투표 수 (기본값: 0)

**반환값**: 투표 목록 및 통계
```json
{
  "votes": [
    {
      "id": 123,
      "title": {"ko": "투표 제목", "en": "Vote Title"},
      "area": "KPOP",
      "vote_category": "MONTHLY",
      "start_at": "2024-01-01T00:00:00Z",
      "stop_at": "2024-01-31T23:59:59Z",
      "total_votes": 15000,
      "total_participants": 850,
      "total_candy_spent": 75000,
      "status": "active"
    }
  ],
  "summary": {
    "total_count": 45,
    "active_count": 12,
    "ended_count": 30,
    "upcoming_count": 3
  }
}
```

**권한**: `ADMIN` 역할 필요

---

#### 2.2 `admin_get_vote_detail(vote_id)`
**목적**: 특정 투표의 상세 정보 및 통계 조회

**매개변수**:
- `vote_id` (integer): 조회할 투표 ID

**반환값**: 투표 상세 정보
```json
{
  "vote_info": {
    "id": 123,
    "title": {"ko": "투표 제목", "en": "Vote Title"},
    "content": "투표 설명",
    "area": "KPOP",
    "vote_category": "MONTHLY",
    "start_at": "2024-01-01T00:00:00Z",
    "stop_at": "2024-01-31T23:59:59Z",
    "visible_at": "2024-01-01T00:00:00Z"
  },
  "items": [
    {
      "id": 456,
      "artist_name": "아티스트명",
      "group_name": "그룹명",
      "vote_total": 5000,
      "percentage": 33.3,
      "rank": 1
    }
  ],
  "statistics": {
    "total_votes": 15000,
    "total_participants": 850,
    "total_candy_spent": 75000,
    "average_vote_per_user": 17.6,
    "peak_voting_time": "2024-01-15T20:00:00Z"
  }
}
```

**권한**: `ADMIN` 역할 필요

---

#### 2.3 `admin_create_vote(vote_data)`
**목적**: 새로운 투표 생성

**매개변수**:
- `vote_data` (jsonb): 투표 정보
```json
{
  "title": {"ko": "새 투표", "en": "New Vote"},
  "content": "투표 설명",
  "area": "KPOP",
  "vote_category": "SPECIAL",
  "vote_sub_category": "EVENT",
  "start_at": "2024-02-01T00:00:00Z",
  "stop_at": "2024-02-28T23:59:59Z",
  "visible_at": "2024-01-25T00:00:00Z",
  "main_image": "image_url",
  "result_image": "result_image_url",
  "wait_image": "wait_image_url"
}
```

**반환값**: 생성된 투표 정보
```json
{
  "success": true,
  "vote_id": 124,
  "message": "투표가 성공적으로 생성되었습니다."
}
```

**권한**: `VOTE_MANAGER` 또는 `ADMIN` 역할 필요

---

#### 2.4 `admin_update_vote(vote_id, vote_data)`
**목적**: 기존 투표 정보 수정

**매개변수**:
- `vote_id` (integer): 수정할 투표 ID
- `vote_data` (jsonb): 수정할 투표 정보

**제약사항**:
- 진행 중인 투표의 경우 제한적인 필드만 수정 가능
- 종료된 투표는 수정 불가

**권한**: `VOTE_MANAGER` 또는 `ADMIN` 역할 필요

---

#### 2.5 `admin_delete_vote(vote_id, force_delete)`
**목적**: 투표 삭제 (소프트 삭제)

**매개변수**:
- `vote_id` (integer): 삭제할 투표 ID
- `force_delete` (boolean): 강제 삭제 여부 (기본값: false)

**제약사항**:
- 기본적으로 소프트 삭제 (deleted_at 설정)
- 진행 중인 투표는 force_delete=true 시에만 삭제 가능

**권한**: `ADMIN` 역할 필요

---

### 3. 통계 및 리포트 함수

#### 3.1 `admin_get_dashboard_stats(date_from, date_to)`
**목적**: 관리자 대시보드용 핵심 통계 조회

**매개변수**:
- `date_from` (date): 통계 시작 날짜
- `date_to` (date): 통계 종료 날짜

**반환값**: 대시보드 통계
```json
{
  "user_stats": {
    "total_users": 10000,
    "new_users_period": 500,
    "active_users_period": 3500,
    "total_candy_balance": 50000000
  },
  "vote_stats": {
    "total_votes": 45,
    "active_votes": 12,
    "total_participants_period": 8500,
    "total_candy_spent_period": 2500000
  },
  "revenue_stats": {
    "total_purchases_period": 150000,
    "total_transactions_period": 450,
    "average_purchase_amount": 333.33
  }
}
```

**권한**: `ADMIN` 역할 필요

---

#### 3.2 `admin_get_user_activity_report(user_id, date_from, date_to)`
**목적**: 특정 사용자의 활동 리포트 생성

**매개변수**:
- `user_id` (uuid): 대상 사용자 ID
- `date_from` (date): 리포트 시작 날짜
- `date_to` (date): 리포트 종료 날짜

**반환값**: 사용자 활동 리포트
```json
{
  "period": {
    "from": "2024-01-01",
    "to": "2024-01-31"
  },
  "voting_activity": {
    "total_votes": 25,
    "total_spent": 5000,
    "favorite_categories": ["KPOP", "IDOL"],
    "most_voted_artist": "아티스트명"
  },
  "candy_activity": {
    "purchases": 2,
    "purchase_amount": 10000,
    "earned_from_events": 500,
    "current_balance": 1500
  }
}
```

**권한**: `ADMIN` 역할 필요

---

### 4. 시스템 관리 함수

#### 4.1 `admin_cleanup_expired_data(table_name, days_old)`
**목적**: 만료된 데이터 정리

**매개변수**:
- `table_name` (text): 정리할 테이블명
- `days_old` (integer): 보관 기간 (일)

**지원 테이블**:
- `application_logs`: 애플리케이션 로그
- `activities`: 사용자 활동 로그
- `batch_log`: 배치 실행 로그

**반환값**: 정리 결과
```json
{
  "success": true,
  "table_name": "application_logs",
  "deleted_count": 50000,
  "cutoff_date": "2024-01-01T00:00:00Z"
}
```

**권한**: `SYSTEM_ADMIN` 역할 필요

---

#### 4.2 `admin_get_system_health()`
**목적**: 시스템 상태 및 건강도 체크

**매개변수**: 없음

**반환값**: 시스템 상태 정보
```json
{
  "database": {
    "connection_count": 25,
    "slow_queries_count": 2,
    "average_query_time": "15ms"
  },
  "storage": {
    "total_size": "5.2GB",
    "growth_rate": "50MB/day"
  },
  "performance": {
    "rpc_average_time": "120ms",
    "cache_hit_rate": 0.95
  }
}
```

**권한**: `ADMIN` 역할 필요

---

## 🔧 구현 가이드

### PostgreSQL 함수 생성 방법

1. **기본 구조**:
```sql
CREATE OR REPLACE FUNCTION admin_function_name(param1 type1, param2 type2)
RETURNS jsonb AS $$
DECLARE
    current_user_id uuid;
    is_user_admin boolean;
BEGIN
    -- 사용자 인증 확인
    current_user_id := auth.uid();
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION '인증이 필요합니다.';
    END IF;
    
    -- 관리자 권한 확인
    SELECT is_admin() INTO is_user_admin;
    IF NOT is_user_admin THEN
        RAISE EXCEPTION '관리자 권한이 필요합니다.';
    END IF;
    
    -- 실제 기능 구현
    -- ...
    
    RETURN jsonb_build_object('success', true, 'data', result_data);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

2. **권한 설정**:
```sql
-- 함수 실행 권한 부여
GRANT EXECUTE ON FUNCTION admin_function_name TO authenticated;

-- RLS 정책 설정 (필요한 경우)
REVOKE ALL ON admin_function_name FROM public;
```

### 클라이언트 사용 방법

1. **TypeScript 타입 정의**:
```typescript
// types/admin-rpc.ts
export interface AdminUserListParams {
  limit_count?: number;
  offset_count?: number;
  search_term?: string;
}

export interface AdminUserListResponse {
  users: AdminUser[];
  total_count: number;
  has_more: boolean;
}
```

2. **API 래퍼 함수**:
```typescript
// lib/admin-api.ts
export class AdminAPI {
  constructor(private supabase: SupabaseClient) {}
  
  async getUserList(params: AdminUserListParams): Promise<AdminUserListResponse> {
    const { data, error } = await this.supabase.rpc('admin_get_user_list', params);
    
    if (error) {
      throw new AdminAPIError(error.message, error.code);
    }
    
    return data;
  }
}
```

3. **에러 처리**:
```typescript
try {
  const users = await adminAPI.getUserList({ limit_count: 20 });
} catch (error) {
  if (error instanceof AdminAPIError) {
    if (error.code === '42501') { // 권한 부족
      router.push('/unauthorized');
    }
  }
}
```

---

## 🚀 배포 순서

1. **1단계**: 기본 관리자 권한 확인 함수들 배포
   - `is_admin()`
   - `admin_get_user_list()`
   - `admin_get_user_detail()`

2. **2단계**: 사용자 관리 함수들 배포
   - `admin_update_user_candy()`
   - `admin_set_user_admin_status()`

3. **3단계**: 투표 관리 함수들 배포
   - `admin_get_vote_list()`
   - `admin_get_vote_detail()`
   - `admin_create_vote()`

4. **4단계**: 고급 기능 및 통계 함수들 배포
   - `admin_get_dashboard_stats()`
   - `admin_cleanup_expired_data()`

---

## ⚠️ 보안 고려사항

1. **입력 검증**: 모든 매개변수에 대한 철저한 검증
2. **SQL 인젝션 방지**: 동적 쿼리 생성 시 안전한 방법 사용
3. **권한 분리**: 역할별 세분화된 권한 설정
4. **감사 로그**: 모든 관리자 작업에 대한 로그 기록
5. **Rate Limiting**: API 호출 빈도 제한

---

## 📚 참고 자료

- [Supabase RLS 공식 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL 함수 및 프로시저](https://www.postgresql.org/docs/current/plpgsql.html)
- [Supabase RPC 가이드](https://supabase.com/docs/reference/javascript/rpc)

---

**문서 버전**: 1.0  
**최종 수정**: 2024년  
**문의**: 개발팀 (`dev@company.com`) 