# Supabase 사용 현황 감사 문서

이 문서는 클라이언트 사이드에서 Supabase를 직접 사용하는 모든 인스턴스를 추적하고 분석하기 위해 작성되었습니다.

## 감사 개요

| 항목 | 내용 |
| --- | --- |
| 감사 시작일 | YYYY-MM-DD |
| 감사 종료일 | YYYY-MM-DD |
| 담당자 | |

## Supabase 사용 인스턴스 목록

| 파일 위치 | 라인 | 사용된 Supabase 함수 | 데이터베이스 작업 (CRUD) | 관련 테이블/RPC | 실시간(Realtime) 사용 여부 | 인증 필요 여부 | 비고 |
|---|---|---|---|---|---|---|---|
| `app/[lang]/(mypage)/mypage/recharge-history/RechargeHistoryClient.tsx` | 3 | `User` 타입 임포트 | - | - | 아니요 | 예 | Supabase 유저 타입을 직접 사용. 데이터 페칭은 `useInfiniteScroll` 훅을 통해 `/api/user/recharge-history` API를 호출하므로 직접적인 DB 연결은 아님. 하지만 타입 의존성 있음. |
| `lib/supabase/client.ts` | 2 | `createBrowserClient` | 클라이언트 생성 | - | 아니요 | - | **(핵심)** 브라우저용 Supabase 클라이언트를 생성하는 주된 파일. 제거 대상 1순위. |
| `lib/supabase/auth-provider.tsx` | 5 | `createBrowserClient` | 클라이언트 생성 | - | 예 | 예 | 인증 상태 변경을 감지하고, 세션을 관리하기 위해 클라이언트를 생성. 실시간 구독(onAuthStateChange) 기능 사용. |
| `lib/supabase/server.ts` | 2, 18 | `createServerClient` | 서버 클라이언트 생성 | - | 아니요 | 예 | 서버 컴포넌트 및 API 라우트에서 사용될 서버용 클라이언트를 생성. 이 파일은 유지 및 강화 대상. |
| `lib/auth/logout.ts` | 4 | `createBrowserClient` | 클라이언트 생성 | `auth.signOut` (Delete) | - | 예 | 로그아웃 처리를 위해 클라이언트에서 직접 `signOut`을 호출. API로 이전 필요. |
| `__tests__/lib/supabase/client.test.ts` | 4 | `createBrowserClient` | 테스트용 모킹 | - | - | - | 테스트 코드. 리팩토링 후 테스트 코드도 함께 수정 필요. |
| `jest.setup.js` | 200 | `createBrowserClient`, `createServerClient` | 테스트용 모킹 | - | - | - | 전역 테스트 설정. 리팩토링 후 테스트 코드도 함께 수정 필요. |

## 공통 사용 패턴 분석

- **인증 관련**:
  - `lib/supabase/auth-provider.tsx`에서 `onAuthStateChange`를 사용하여 전역적으로 사용자 인증 상태를 관리하고 있음.
  - `lib/auth/logout.ts`에서 클라이언트가 직접 로그아웃을 처리함.
- **데이터 조회**:
  - `RechargeHistoryClient.tsx`의 경우처럼, 일부 컴포넌트는 이미 API를 통해 데이터를 조회하고 있으나, Supabase 타입을 직접 참조하는 경우가 있음.
  - **(추가 분석 필요)** 다른 클라이언트 컴포넌트에서 직접 `.from('table').select()`를 사용하는 경우가 있는지 전역적으로 확인해야 함.
- **데이터 수정**:
  - **(추가 분석 필요)** 투표, 댓글 작성 등 사용자의 인터랙션과 관련된 부분에서 데이터 수정이 클라이언트에서 직접 일어나는지 확인 필요.

## 커스텀 로직 및 데이터 변환

- (예: `some/component.tsx` 에서는 Supabase에서 받은 데이터를 클라이언트에서 특정 형태로 가공하여 사용함)

## 의존성 그래프

(이 섹션은 Miro, Lucidchart 등의 도구를 사용하여 시각화한 후 링크 또는 이미지를 첨부합니다.)

- 클라이언트 컴포넌트와 Supabase 호출 간의 관계를 시각적으로 표현합니다. 

### 3. 실시간(Realtime) 사용 현황

- **`hooks/useSupabaseRealtime.ts`**:
  - **설명**: 재사용 가능한 React 훅 (`useSupabaseSubscription`, `useRealtimeData`)을 통해 실시간 구독 기능을 제공합니다.
  - **방식**: 클라이언트에서 직접 `createBrowserSupabaseClient`를 사용하여 Supabase Realtime에 연결합니다.
  - **테이블**: 특정 테이블에 종속되지 않고, 훅 사용 시 `table`, `filter`, `event` 옵션을 통해 동적으로 구독 대상을 지정합니다.
  - **조치 필요**: 이 훅을 사용하는 모든 컴포넌트를 찾아 새로운 서버 기반 실시간 아키텍처(예: SSE)를 사용하도록 마이그레이션해야 합니다.

- **`lib/supabase/realtime.ts`**:
  - **설명**: `VoteRealtimeService` 클래스를 통해 투표 관련 실시간 기능을 중앙에서 관리하는 싱글톤 서비스입니다.
  - **방식**: 클라이언트에서 직접 `createBrowserSupabaseClient`를 사용하여 Supabase Realtime에 연결합니다.
  - **구독 대상**:
    - `vote` 테이블 (UPDATE)
    - `vote_item` 테이블 (UPDATE)
    - `vote_pick` 테이블 (INSERT)
    - `artist_vote` 테이블 (UPDATE)
    - `artist_vote_item` 테이블 (UPDATE)
  - **조치 필요**: 이 서비스를 사용하는 부분을 찾아, 서버에서 이벤트를 받아 클라이언트로 전달하는 새로운 방식으로 대체해야 합니다. 서비스의 복잡한 연결 관리 로직(네트워크, 가시성 감지)은 서버 사이드(예: SSE 엔드포인트)로 이전되어야 합니다. 