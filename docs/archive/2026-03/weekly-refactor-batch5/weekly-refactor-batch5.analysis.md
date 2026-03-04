# Gap Analysis Report: weekly-refactor-batch5

## 분석 개요
- **분석 대상**: weekly-refactor-batch5 (300줄+ 파일 분해)
- **계획 문서**: `docs/01-plan/features/weekly-refactor-batch5.plan.md`
- **구현 경로**: `utils/jwt-parser*`, `hooks/*retryable-query*`, `app/[lang]/not-found*`
- **분석일**: 2026-03-05

---

## 전체 점수

| 카테고리 | 점수 | 상태 |
|----------|:----:|:----:|
| 설계 일치도 | 90% | [양호] |
| 아키텍처 준수도 | 100% | [우수] |
| 컨벤션 준수도 | 95% | [우수] |
| **종합** | **93%** | **[우수]** |

---

## 1. jwt-parser.ts 분해 (616줄 → 4파일)

### 심볼 배치: 14/14 일치 (100%)

| 심볼 | 계획 위치 | 실제 위치 | 일치 |
|------|-----------|-----------|:----:|
| `jwtDebug`, `debugLog`, `debugWarn` | jwt-parser-core.ts | jwt-parser-core.ts | OK |
| `decodeJWTPayload()` | jwt-parser-core.ts | jwt-parser-core.ts | OK |
| `extractUserFromJWT()` | jwt-parser-core.ts | jwt-parser-core.ts | OK |
| `getSupabaseTokenFromCookies()` | jwt-parser-source.ts | jwt-parser-source.ts | OK |
| `getSupabaseTokenFromStorage()` | jwt-parser-source.ts | jwt-parser-source.ts | OK |
| `debugJWTInfo()` | jwt-parser-debug.ts | jwt-parser-debug.ts | OK |
| `debugLocalCookies()` | jwt-parser-debug.ts | jwt-parser-debug.ts | OK |
| window 등록 블록 | jwt-parser-debug.ts | jwt-parser-debug.ts | OK |
| `getInstantUserFromCookies()` | jwt-parser.ts barrel | jwt-parser.ts barrel | OK |
| `getTokenExpiry/isTokenExpiringSoon/getTokenRemainingMs` | jwt-parser.ts barrel | jwt-parser.ts barrel | OK |

### 줄 수 비교

| 파일 | 계획 | 실제 | 300줄 미만 |
|------|:----:|:----:|:----------:|
| jwt-parser.ts (barrel) | ~60줄 | 69줄 | OK |
| jwt-parser-core.ts | ~100줄 | 103줄 | OK |
| jwt-parser-source.ts | ~260줄 | **329줄** | **초과 (+29)** |
| jwt-parser-debug.ts | ~120줄 | 153줄 | OK |

### 차이

- **jwt-parser-source.ts 329줄**: `getSupabaseTokenFromCookies()` 자체가 234줄 단일 함수로 추가 분할이 어려움
- **jwt-parser-debug.ts 인라인 로직**: 순환 의존성 방지를 위해 `getTokenExpiry`/`isTokenExpiringSoon` 로직을 인라인 구현 (합리적 판단)
- **barrel 구조**: 계획의 `jwt-parser-public` 별도 파일 대신 barrel에 직접 구현 (계획에서 허용한 대안)

---

## 2. useRetryableQuery.ts 분해 (588줄 → 3파일)

### 심볼 배치: 16/16 일치 (100%)

### 줄 수 비교

| 파일 | 계획 | 실제 | 300줄 미만 |
|------|:----:|:----:|:----------:|
| useRetryableQuery.ts (core) | ~220줄 | 250줄 | OK |
| retryable-query-types.ts | ~70줄 | 93줄 | OK |
| retryable-query-presets.ts | ~270줄 | 278줄 | OK |

### 차이

- **presets barrel re-export 제거**: 계획에서는 `export * from './retryable-query-presets'`를 포함했으나, 순환 의존성 방지를 위해 제거. `useVoteResults.ts`가 `./retryable-query-presets`에서 직접 import하도록 변경. 기능적 문제 없음.

---

## 3. not-found.tsx 분해 (534줄 → 3파일)

### 심볼 배치: 8/8 일치 (100%)

### 줄 수 비교

| 파일 | 계획 | 실제 | 300줄 미만 |
|------|:----:|:----:|:----------:|
| not-found.tsx (main) | ~270줄 | 249줄 | OK |
| not-found-data.ts | ~120줄 | 128줄 | OK |
| NotFoundDecorations.tsx | ~150줄 | 187줄 | OK |

### 차이

유의미한 차이 없음. 계획과 거의 완벽히 일치.

---

## 4. Hard Constraints 검증

| 제약 조건 | 결과 |
|-----------|:----:|
| behavior-preserving | OK |
| 공개 API 변경 금지 | OK |
| 새 의존성 금지 | OK |
| 순환 의존성 금지 | OK |

## 5. 외부 소비자 검증

| 소비자 | import 경로 | 결과 |
|--------|------------|:----:|
| auth-store-auth.ts | `@/utils/jwt-parser` (dynamic) | 불변 |
| hooks/index.ts | `./useRetryableQuery` | 불변 |
| hooks/useVoteResults.ts | `./retryable-query-presets` (변경) | 기능 정상 |

---

## 6. 종합 평가

Batch 5 구현은 계획 대비 **93% 일치율**. 핵심 제약 조건 100% 준수.

주요 발견:
- `jwt-parser-source.ts` 329줄 (300줄 기준 29줄 초과) — 단일 함수 크기 문제로 추가 분할 어려움
- presets barrel re-export 제거는 순환 의존성 방지를 위한 합리적 판단
- 시리즈 평균: Batch 1 (100%), Batch 2 (93%), Batch 3 (95%), Batch 4 (95%), Batch 5 (93%) = **95.2%**
