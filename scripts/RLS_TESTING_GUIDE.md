# RLS Policy Testing Guide

이 가이드는 Picnic 애플리케이션의 Row-Level Security (RLS) 정책이 올바르게 구현되고 작동하는지 테스트하는 방법을 설명합니다.

## 📋 사전 요구사항

1. **Supabase 프로젝트 설정**
   - Supabase 프로젝트가 활성화되어 있어야 합니다
   - 환경 변수가 올바르게 설정되어 있어야 합니다

2. **환경 변수**
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   ```

3. **필요한 패키지 설치**
   ```bash
   npm install @supabase/supabase-js
   npm install --save-dev @types/jest @types/node
   ```

## 🚀 RLS 정책 적용

### 1. RLS 정책 스크립트 실행

먼저 Supabase SQL Editor에서 다음 스크립트를 실행합니다:

```bash
# RLS 정책 적용
cat scripts/apply-rls-policies.sql
```

이 스크립트는 다음을 수행합니다:
- 주요 테이블에 RLS 활성화
- 헬퍼 함수 생성 (`auth.is_admin()`, `auth.owns_resource()`)
- 보안 정책 적용
- 정책 검증 쿼리 실행

### 2. 정책 적용 확인

Supabase Dashboard → SQL Editor에서 다음 쿼리로 RLS 상태를 확인:

```sql
-- RLS 활성화 상태 확인
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment', 'vote_comment_like',
    'vote', 'vote_item', 'artist', 'artist_group'
)
ORDER BY tablename;

-- 정책 목록 확인
SELECT 
    tablename,
    policyname,
    cmd,
    permissive
FROM pg_policies 
WHERE tablename IN (
    'user_profiles', 'vote_pick', 'vote_comment'
)
ORDER BY tablename, policyname;
```

## 🧪 자동화된 테스트 실행

### 1. Node.js 검증 스크립트

```bash
# RLS 정책 검증 스크립트 실행
node scripts/validate-rls-policies.js
```

이 스크립트는 다음을 테스트합니다:
- ✅ RLS가 주요 테이블에 활성화되어 있는지
- ✅ 필수 정책들이 존재하는지
- ✅ 헬퍼 함수들이 작동하는지
- ✅ 퍼블릭 테이블 접근이 올바른지
- ✅ 사용자 데이터 격리가 작동하는지
- ✅ 성능 영향이 허용 범위 내인지

### 2. Jest 통합 테스트

```bash
# Jest 테스트 실행
npm test __tests__/security/rls-policies-integration.test.ts
```

## 🔒 수동 보안 테스트

### 1. 사용자 프로필 보안 테스트

**테스트 1: 익명 사용자가 민감한 데이터에 접근할 수 없는지 확인**

```sql
-- Supabase Dashboard에서 anon 키로 실행
SELECT id, star_candy, star_candy_bonus 
FROM user_profiles 
LIMIT 5;
-- 결과: 빈 결과 또는 null 값이어야 함
```

**테스트 2: 공개 프로필 정보는 읽을 수 있는지 확인**

```sql
-- 공개 정보는 접근 가능해야 함
SELECT id, nickname 
FROM user_profiles 
WHERE deleted_at IS NULL 
LIMIT 5;
-- 결과: 닉네임 정보는 접근 가능해야 함
```

### 2. 투표 선택 보안 테스트

**테스트 3: 익명 사용자가 투표 선택을 볼 수 없는지 확인**

```sql
-- anon 키로 실행
SELECT user_id, amount 
FROM vote_pick 
LIMIT 5;
-- 결과: 빈 결과여야 함
```

**테스트 4: 투표 선택 조작 시도**

```sql
-- anon 키로 실행 (실패해야 함)
INSERT INTO vote_pick (user_id, vote_id, vote_item_id, amount)
VALUES ('fake-user', 1, 1, 999);
-- 결과: 에러가 발생해야 함
```

### 3. 공개 데이터 접근 테스트

**테스트 5: 투표 데이터 읽기**

```sql
-- 모든 사용자가 접근 가능해야 함
SELECT id, vote_content, area, category 
FROM vote 
WHERE deleted_at IS NULL 
LIMIT 5;
-- 결과: 데이터가 반환되어야 함
```

**테스트 6: 투표 데이터 수정 시도**

```sql
-- anon 키로 실행 (실패해야 함)
UPDATE vote 
SET vote_content = '{"ko": "해킹된 투표"}'
WHERE id = 1;
-- 결과: 에러가 발생해야 함
```

### 4. 댓글 보안 테스트

**테스트 7: 댓글 읽기**

```sql
-- 인증된 사용자는 댓글을 읽을 수 있어야 함
SELECT id, user_id, content 
FROM vote_comment 
WHERE deleted_at IS NULL 
LIMIT 5;
-- 결과: 댓글이 반환되어야 함
```

**테스트 8: 댓글 수정 시도**

```sql
-- anon 키로 실행 (실패해야 함)
UPDATE vote_comment 
SET content = '해킹된 댓글'
WHERE id = 1;
-- 결과: 에러가 발생해야 함
```

## 🎯 Edge Case 테스트

### 1. 삭제된 레코드 필터링

```sql
-- 삭제된 레코드는 접근할 수 없어야 함
SELECT * 
FROM user_profiles 
WHERE deleted_at IS NOT NULL;
-- 결과: 빈 결과여야 함
```

### 2. NULL user_id 처리

```sql
-- NULL user_id 처리 확인
SELECT * 
FROM vote_comment 
WHERE user_id IS NULL;
-- 결과: 적절히 처리되어야 함
```

### 3. SQL Injection 방어

```sql
-- SQL 인젝션 시도
SELECT * 
FROM user_profiles 
WHERE id = '\'; DROP TABLE user_profiles; --';
-- 결과: 안전하게 처리되어야 함
```

## ⚡ 성능 테스트

### 1. 쿼리 성능 확인

```sql
-- 성능 영향 측정
EXPLAIN (ANALYZE, BUFFERS) 
SELECT id, nickname 
FROM user_profiles 
WHERE deleted_at IS NULL 
LIMIT 10;
```

### 2. 대용량 데이터 테스트

```sql
-- 큰 결과 집합에서의 성능
EXPLAIN (ANALYZE, BUFFERS)
SELECT vote_id, SUM(amount) as total_votes 
FROM vote_pick 
GROUP BY vote_id 
LIMIT 100;
```

## 🔧 헬퍼 함수 테스트

### 1. is_admin() 함수 테스트

```sql
-- 관리자 확인 함수 테스트
SELECT auth.is_admin() as is_current_user_admin;
```

### 2. owns_resource() 함수 테스트

```sql
-- 리소스 소유권 확인 함수 테스트
SELECT auth.owns_resource('test-user-id') as owns_resource;
```

## 📊 테스트 결과 분석

### 성공 기준

1. **RLS 활성화**: 모든 중요 테이블에서 `rowsecurity = true`
2. **정책 존재**: 필수 정책들이 모두 생성되어 있음
3. **접근 제어**: 
   - 익명 사용자는 민감한 데이터에 접근할 수 없음
   - 공개 데이터는 읽기 가능
   - 수정 권한이 올바르게 제한됨
4. **성능**: 쿼리 실행 시간이 허용 범위 내 (일반적으로 1초 이하)
5. **보안**: SQL 인젝션 및 기타 공격에 안전함

### 실패 시 대응

1. **RLS 미활성화**: `scripts/apply-rls-policies.sql` 재실행
2. **정책 누락**: 특정 정책 재생성
3. **접근 제어 실패**: 정책 로직 검토 및 수정
4. **성능 문제**: 인덱스 추가 또는 정책 최적화
5. **보안 취약점**: 정책 강화 및 추가 검증

## 🚨 보안 체크리스트

- [ ] RLS가 모든 중요 테이블에 활성화됨
- [ ] 사용자는 자신의 데이터만 접근 가능
- [ ] 관리자는 모든 데이터에 접근 가능
- [ ] 공개 데이터는 읽기 전용
- [ ] 익명 사용자의 수정 작업이 차단됨
- [ ] 삭제된 레코드가 필터링됨
- [ ] SQL 인젝션이 방어됨
- [ ] 성능 영향이 최소화됨
- [ ] 헬퍼 함수가 올바르게 작동함
- [ ] Edge case가 적절히 처리됨

## 📝 테스트 보고서 작성

테스트 완료 후 다음 정보를 포함한 보고서를 작성하세요:

1. **테스트 실행 날짜 및 환경**
2. **통과한 테스트 수 / 전체 테스트 수**
3. **실패한 테스트 목록 및 원인**
4. **성능 측정 결과**
5. **보안 취약점 발견 여부**
6. **권장 사항 및 개선점**

## 🔄 정기 테스트 일정

- **개발 중**: 코드 변경 시마다
- **스테이징**: 배포 전 필수 실행
- **프로덕션**: 월 1회 정기 점검
- **보안 감사**: 분기별 1회

이 가이드를 따라 RLS 정책을 철저히 테스트하여 Picnic 애플리케이션의 데이터 보안을 보장하세요.