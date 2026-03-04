# Plan: minor-cleanup

> picnic-web 코드 리뷰에서 발견된 Minor 이슈 25건 정리

**Date**: 2026-02-12
**Feature**: minor-cleanup
**Phase**: Plan
**Target Score**: 90+/100 (현재 85-90)

---

## 1. Background

이전 코드 리뷰에서 총 92건의 이슈가 발견되었으며, Critical 19건 + Major 17건을 수정하여
점수를 49/100 → 85-90/100으로 개선했습니다.

남은 Minor 25건을 정리하여 90점 이상을 목표로 합니다.

---

## 2. Current State (정량 분석)

| 항목 | 수치 | 비고 |
|------|:----:|------|
| `console.*` 호출 | 872건 / 163파일 | `console.log` 포함 모든 레벨 |
| `: any` 타입 | 257건 / 101파일 | 파라미터, 변수, 리턴 타입 |
| `as any` 캐스팅 | 183건 / 68파일 | 타입 단언 우회 |
| Retry 관련 파일 | 45파일 | 3개 시스템 중복 가능성 |

---

## 3. Scope (수정 범위)

### 3.1 Console Log 정리 (High Impact)

**목표**: 프로덕션 빌드에서 불필요한 console 출력 제거

**전략**:
- `next.config.js`의 `removeConsole` 설정 활용 (이미 존재)
- 의도적인 에러 로깅(`console.error`)은 유지
- 개발/디버그용 `console.log`만 제거
- `scripts/` 디렉토리는 제외 (CLI 도구)

**주요 대상** (10건 이상):
| 파일 | 건수 | 분류 |
|------|:----:|------|
| `app/api/payment/portone/webhook/route.ts` | 54 | 서버 로깅 → 유지 or 구조화 |
| `lib/supabase/social/service.ts` | 45 | 디버그 → 제거/축소 |
| `lib/supabase/auth-provider.tsx` | 27 | 디버그 → 제거 |
| `app/api/payment/portone/verify/route.ts` | 25 | 서버 로깅 → 유지 or 구조화 |
| `hooks/useAuthGuard.ts` | 25 | 디버그 → 제거 |
| `utils/auth-redirect.ts` | 23 | 디버그 → 제거 |
| `lib/data-fetching/server/supabase-service.ts` | 22 | 디버그 → 제거/축소 |
| `lib/data-fetching/client/vote-api-enhanced.ts` | 19 | 디버그 → 제거 |
| `lib/supabase/client.ts` | 19 | 디버그 → 제거 |
| `utils/image-utils.ts` | 18 | 디버그 → 제거 |

### 3.2 `any` 타입 축소 (Medium Impact)

**목표**: 핵심 모듈의 `any` 사용을 구체적 타입으로 교체

**전략**:
- 전체 257건 중 영향도 높은 파일부터 처리
- `scripts/` 디렉토리 제외
- 서드파티 라이브러리 타입 누락은 `unknown` + type guard로 대체
- Supabase 관련은 `Database` 타입 활용

**주요 대상**:
| 파일 | 건수 | 난이도 |
|------|:----:|:------:|
| `lib/data-fetching/server/community-service.ts` | 20 | Medium |
| `utils/api/queries.ts` | 10 | Medium |
| `utils/api/enhanced-retry-utils.ts` | 9 | Low |
| `hooks/useRetryableQuery.ts` | 9 | Medium |
| `lib/supabase/social/service.ts` | 7 | Medium |
| `app/[lang]/(main)/goong-hap/[id]/GoongHapDetailClient.tsx` | 7 | Low |

### 3.3 Retry 시스템 통합 (Low Impact, High Effort)

**현황**: 3개의 retry 유틸리티가 존재
- `utils/retry.ts` - 기본 retry
- `utils/api/retry-utils.ts` - API retry
- `utils/api/enhanced-retry-utils.ts` - 향상된 retry

**전략**: 이번 사이클에서는 통합하지 않고, 사용처 매핑만 수행.
통합은 별도 PDCA 사이클로 진행 권장 (Breaking change 위험).

### 3.4 기타 Minor 이슈

| # | 이슈 | 대상 | 우선순위 |
|---|------|------|:--------:|
| 1 | 미사용 import 정리 | 전체 | Low |
| 2 | Magic number 상수화 | 투표/결제 관련 | Low |
| 3 | 중복 유틸리티 함수 | utils/ | Low |
| 4 | 불필요한 `@ts-ignore` | 전체 | Medium |

---

## 4. Out of Scope

- Retry 시스템 통합 (별도 PDCA)
- `scripts/` 디렉토리 (CLI 도구, 프로덕션 미포함)
- `__tests__/` 디렉토리
- `components/debug/` (개발 전용)
- 서드파티 타입 정의 누락 (upstream 이슈)

---

## 5. Implementation Plan

### Phase 1: Console Log 정리 (예상 영향: +3-5점)
1. `next.config.js` removeConsole 설정 확인/강화
2. 클라이언트 코드에서 `console.log` 제거 (디버그용)
3. 서버 API route에서 과도한 로깅 축소
4. 구조화된 로깅이 필요한 곳은 `utils/logger.ts` 활용

### Phase 2: `any` 타입 축소 (예상 영향: +2-3점)
1. `community-service.ts` Supabase 타입 적용
2. `queries.ts` 제네릭 타입 강화
3. `enhanced-retry-utils.ts` 제네릭 개선
4. Social auth 관련 타입 구체화

### Phase 3: 기타 Minor (예상 영향: +1-2점)
1. 미사용 import 정리
2. Magic number 상수화
3. `@ts-ignore` → proper type fix

---

## 6. Success Criteria

| 지표 | 현재 | 목표 |
|------|:----:|:----:|
| Code Quality Score | 85-90 | 90+ |
| `console.log` (클라이언트) | ~500 | <50 |
| `: any` 사용 | 257 | <150 |
| `as any` 사용 | 183 | <120 |
| Match Rate | - | >= 90% |

---

## 7. Risks

| 리스크 | 영향 | 대응 |
|--------|:----:|------|
| console 제거 시 에러 추적 어려움 | Medium | `console.error`는 유지, logger 활용 |
| any → 구체적 타입 변환 시 빌드 에러 | High | 점진적 변환, tsc --noEmit 검증 |
| 대량 파일 변경으로 PR 리뷰 부담 | Low | Phase별 분리 커밋 |

---

## 8. Team Strategy

팀 구성으로 Phase 1-3을 병렬 처리:
- **console-cleaner**: Phase 1 담당
- **type-fixer**: Phase 2 담당
- **misc-fixer**: Phase 3 담당
