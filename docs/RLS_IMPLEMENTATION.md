# Row-Level Security (RLS) Implementation Guide

## 📋 개요

이 문서는 Picnic 애플리케이션의 Supabase 데이터베이스에서 Row-Level Security (RLS) 정책 구현에 대한 가이드입니다. RLS를 통해 사용자는 자신의 데이터에만 접근할 수 있으며, 관리자는 모든 데이터에 접근할 수 있습니다.

## 🎯 보안 목표

1. **데이터 프라이버시**: 사용자는 자신의 투표 기록과 개인 정보만 볼 수 있음
2. **권한 분리**: 일반 사용자와 관리자의 접근 권한 구분
3. **무결성 보장**: 사용자는 자신의 데이터만 수정 가능
4. **공개 정보 접근**: 투표 정보, 아티스트 정보 등은 모든 인증된 사용자가 조회 가능

## 📁 파일 구조

```
packages/web/picnic-web/
├── scripts/
│   ├── rls-policies.sql           # RLS 정책 구현 스크립트
│   └── test-rls-policies.sql      # RLS 테스트 스크립트
└── docs/
    └── RLS_IMPLEMENTATION.md      # 이 문서
```

## 🔐 구현된 RLS 정책

### 1. user_profiles 테이블

| 정책명 | 작업 | 조건 | 설명 |
|--------|------|------|------|
| `user_profiles_select_own` | SELECT | `auth.uid() = id` | 사용자는 자신의 프로필만 조회 |
| `user_profiles_select_admin` | SELECT | `is_admin = true` | 관리자는 모든 프로필 조회 |
| `user_profiles_select_public` | SELECT | `authenticated AND deleted_at IS NULL` | 공개 필드(nickname, avatar_url)는 모든 인증 사용자 조회 가능 |
| `user_profiles_update_own` | UPDATE | `auth.uid() = id` | 사용자는 자신의 프로필만 수정 |
| `user_profiles_update_admin` | UPDATE | `is_admin = true` | 관리자는 모든 프로필 수정 |
| `user_profiles_insert_own` | INSERT | `auth.uid() = id` | 사용자는 자신의 프로필만 생성 |
| `user_profiles_delete_admin` | DELETE | `is_admin = true` | 관리자만 프로필 삭제 가능 |

### 2. vote_pick 테이블 (투표 기록)

| 정책명 | 작업 | 조건 | 설명 |
|--------|------|------|------|
| `vote_pick_select_own` | SELECT | `auth.uid()::text = user_id::text` | 사용자는 자신의 투표 기록만 조회 |
| `vote_pick_select_admin` | SELECT | `is_admin = true` | 관리자는 모든 투표 기록 조회 |
| `vote_pick_insert_own` | INSERT | `auth.uid()::text = user_id::text` | 사용자는 자신의 투표만 생성 |
| `vote_pick_update_own` | UPDATE | `auth.uid()::text = user_id::text` | 사용자는 자신의 투표만 수정 |
| `vote_pick_delete_own` | DELETE | `auth.uid()::text = user_id::text` | 사용자는 자신의 투표만 삭제 |

### 3. vote_comment 테이블 (투표 댓글)

| 정책명 | 작업 | 조건 | 설명 |
|--------|------|------|------|
| `vote_comment_select_all` | SELECT | `authenticated AND deleted_at IS NULL` | 모든 인증 사용자가 댓글 조회 |
| `vote_comment_insert_auth` | INSERT | `auth.uid() IS NOT NULL` | 인증 사용자만 댓글 작성 |
| `vote_comment_update_own` | UPDATE | `auth.uid()::text = user_id::text` | 댓글 작성자만 수정 |
| `vote_comment_update_admin` | UPDATE | `is_admin = true` | 관리자는 모든 댓글 수정 |
| `vote_comment_delete_own` | DELETE | `auth.uid()::text = user_id::text` | 댓글 작성자만 삭제 |
| `vote_comment_delete_admin` | DELETE | `is_admin = true` | 관리자는 모든 댓글 삭제 |

### 4. 공개 테이블 (vote, vote_item, artist, artist_group)

| 테이블 | 조회 권한 | 수정 권한 | 설명 |
|--------|-----------|-----------|------|
| `vote` | 모든 사용자 | 관리자만 | 투표 정보는 공개, 수정은 관리자만 |
| `vote_item` | 모든 사용자 | 관리자만 | 투표 항목 정보는 공개 |
| `artist` | 모든 사용자 | 관리자만 | 아티스트 정보는 공개 |
| `artist_group` | 모든 사용자 | 관리자만 | 아티스트 그룹 정보는 공개 |

## 🔧 헬퍼 함수

### auth.is_admin()
현재 사용자가 관리자인지 확인하는 함수
```sql
SELECT auth.is_admin(); -- true/false 반환
```

### auth.owns_resource(resource_user_id)
현재 사용자가 특정 리소스의 소유자인지 확인하는 함수
```sql
SELECT auth.owns_resource('user-id'); -- true/false 반환
```

## 🚀 배포 가이드

### 1. RLS 정책 적용

```bash
# Supabase SQL Editor에서 실행
cat scripts/rls-policies.sql
```

또는 Supabase CLI 사용:
```bash
supabase db reset --linked
supabase db push
```

### 2. 테스트 실행

```bash
# 테스트 스크립트 실행
cat scripts/test-rls-policies.sql
```

### 3. 정책 검증

Supabase 대시보드에서 다음을 확인:
1. **Database > Tables**: 각 테이블에서 RLS가 활성화되었는지 확인
2. **Authentication > Users**: 테스트 사용자로 로그인하여 정책 동작 확인
3. **Database > Policies**: 생성된 정책들이 올바르게 적용되었는지 확인

## 🧪 테스트 시나리오

### 시나리오 1: 일반 사용자 (test-user-1)
```sql
-- 자신의 투표 기록만 조회 (성공)
SELECT * FROM vote_pick WHERE user_id = auth.uid()::text;

-- 다른 사용자의 투표 기록 조회 (실패/필터됨)
SELECT * FROM vote_pick;

-- 공개 투표 정보 조회 (성공)
SELECT * FROM vote WHERE deleted_at IS NULL;
```

### 시나리오 2: 관리자 사용자 (test-admin-1)
```sql
-- 모든 투표 기록 조회 (성공)
SELECT * FROM vote_pick;

-- 투표 정보 수정 (성공)
UPDATE vote SET updated_at = NOW() WHERE id = 1;

-- 사용자 프로필 관리 (성공)
SELECT * FROM user_profiles;
```

### 시나리오 3: 비인증 사용자
```sql
-- 모든 데이터 접근 (실패)
SELECT * FROM user_profiles; -- 오류
SELECT * FROM vote_pick;     -- 오류
```

## ⚠️ 주의사항

### 1. 성능 고려사항
- RLS 정책은 모든 쿼리에 적용되므로 성능에 영향을 줄 수 있습니다
- 인덱스가 RLS 조건에 맞게 최적화되어 있는지 확인하세요
- 복잡한 정책은 쿼리 실행 계획을 확인하여 성능을 검토하세요

### 2. 개발 환경에서의 테스트
```sql
-- RLS 비활성화 (개발/디버깅 용도)
SET row_security = off;

-- RLS 활성화
SET row_security = on;
```

### 3. 서비스 역할 (service_role)
- `service_role`은 RLS를 우회합니다
- 백엔드 서비스에서만 사용하고, 클라이언트에 노출하지 마세요
- 관리자 작업이나 시스템 작업에서만 사용하세요

## 🔍 모니터링 및 로깅

### 1. RLS 정책 위반 로깅
```sql
-- 정책 위반 시도 로깅 설정
ALTER SYSTEM SET log_statement = 'all';
ALTER SYSTEM SET log_min_duration_statement = 1000;
```

### 2. 정책 성능 모니터링
```sql
-- 쿼리 성능 분석
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM vote_pick WHERE user_id = auth.uid()::text;
```

### 3. 정책 사용 통계
```sql
-- 각 테이블의 RLS 상태 확인
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE rowsecurity = true;
```

## 🆘 트러블슈팅

### 문제 1: "insufficient privilege" 오류
**원인**: RLS 정책이 너무 제한적
**해결**: 정책 조건을 확인하고 필요시 수정

### 문제 2: 성능 저하
**원인**: RLS 정책으로 인한 쿼리 최적화 문제
**해결**: 
- 적절한 인덱스 생성
- 정책 조건 최적화
- 쿼리 패턴 검토

### 문제 3: 예상과 다른 데이터 조회
**원인**: 정책 조건 로직 오류
**해결**:
- `test-rls-policies.sql` 실행하여 정책 동작 확인
- 정책 조건 재검토

## 📚 참고 자료

- [Supabase RLS 공식 문서](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS 문서](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Supabase Auth 가이드](https://supabase.com/docs/guides/auth)

## 📞 지원

RLS 구현과 관련된 문제가 있다면:
1. 이 문서의 트러블슈팅 섹션 확인
2. 테스트 스크립트로 정책 동작 검증
3. Supabase 대시보드에서 정책 상태 확인
4. 개발팀에 문의

---

마지막 업데이트: 2025년 1월 27일