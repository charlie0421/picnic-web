# 앱 정책 동기화 검증 기록 (2026-08)

`feat/app-policy-sync` 브랜치에서 픽닉 앱의 확정 정책을 picnic-web 에 동기화하며 조사·검증한 결과 기록.
계획서: `.orca-inputs/plan-web-policy-sync.md`. 본 문서는 Task B8 의 산출물이며, 이미 반영된 항목·의도적으로
범위 밖에 둔 dead code·웹에 적용 대상이 없는 정책을 실행한 grep 근거와 함께 남긴다.

## 1. PIC CHART area 계약 통일 (#39) — 기반영, 재구현 없음

`421eeb4b` (#39) 에서 `vote_category IN ('image','weekly')` sentinel 필터를 `areas` contains 계약으로
통일 완료. 이번 작업에서는 재구현하지 않고 잔존 참조만 검증했다.

```bash
grep -rn "vote_category" lib/ components/ app/ --include='*.ts' --include='*.tsx' | grep -v __tests__
```

결과 (필터 로직 잔존 0건 — 표시 라벨/내역 매핑만 잔존):

- `lib/data-fetching/server/vote-service-query.ts:21` — select 컬럼 목록의 일부(필터 조건 아님)
- `lib/data-fetching/server/user-service-vote-history.ts:35,107` — 내 투표 내역 응답에 라벨용으로 매핑
- `components/client/vote/list/VoteCard.tsx:178-187` — 카드에 표시할 카테고리 라벨 렌더링

세 곳 모두 `areas` 기반 필터 로직과 무관한 표시/매핑 용도이며, 필터링 자체는 `vote-service-query.ts`/
`vote-service.client.ts` 양쪽에서 `areas` contains 로 이미 통일되어 있다(#39 반영 확인).

## 2. 투표 신청(vote item request) 개인정보 경계 — 웹에 적용 대상 없음

```bash
grep -rln "vote_item_request\|artist_request" app/ components/ lib/ hooks/ stores/
```

결과:

- `vote_item_request`: `types/interfaces.ts`, `types/supabase.ts` (Supabase 자동 생성 타입)에만 존재.
  UI/쿼리 경로 없음.
- `artist_request`: `components/anti-abuse/RateLimitedDialog.tsx`, `lib/anti-abuse/handler.ts` 에도
  나타나지만, 실제 신청 기능이 아니라 anti-abuse rate-limit **채널 이름 enum**의 원소일 뿐이다
  (`ad_watch`/`attendance`/`artist_request` 는 모두 "실제 기능 유무와 무관하게 정의된 채널" —
  handler.ts:44 주석 "모호(잠시 후 다시 시도)" 참고). `app/api/` 전체에 해당 채널을 트리거하는
  라우트가 없다(`grep -rln "artist_request\|vote_item_request" app/api/` → 0건).

**결론:** 투표 신청 기능 자체(제출 폼, API, 쿼리)가 웹에 존재하지 않으므로 "투표 신청 개인정보 경계"
정책은 웹에 적용 대상이 없다. 향후 웹에 신청 기능을 추가할 경우, 앱과 동일하게 **익명 aggregate 응답 +
자기 행(row)만 조회 가능한 계약**을 따라야 한다.

## 3. `x-pathname` dead code — 이번 범위 밖(§1-4 결정)

```bash
grep -n "x-pathname\|x-url\|VoteLiteClientLayout\|isOpenInBrowser" "app/[lang]/layout.tsx"
grep -n "x-pathname\|x-url" middleware.ts
```

`app/[lang]/layout.tsx:77-89` 에서 `x-pathname`/`x-url` 헤더를 읽어 `isOpenInBrowser` 분기로
`VoteLiteClientLayout`/`BannerListFetcher` 경로를 실행하지만, `middleware.ts` 어디에서도 이 헤더를
설정하지 않는다(0건) — 즉 이 분기는 프로덕션에서 한 번도 실행되지 않는 dead code이고, 모든 요청이
`ClientLayout` 을 사용한다.

**결정 (계획서 §1-4 (c)):** 이번 정책 동기화 범위 밖에 둔다.

- 현재 동작(전 경로 `ClientLayout`)은 이번 작업 전후로 동일 — 정책 동기화 정합성에 영향 없음.
- middleware 주입으로 분기를 되살리면(대안 a) 한 번도 프로덕션에서 실행된 적 없는
  `VoteLiteClientLayout` 이 전 VOTE 경로에 갑자기 적용되는 대규모 회귀 표면이 생겨, 정책 동기화와
  원인 분리가 불가능해진다.
- 통합 삭제(대안 b)는 이번 작업의 원칙인 롤백 용이성과 상충한다.

후속 과제로 분리(계획서 §4-3): middleware 주입(a) 또는 레이아웃 통합(b) 여부는 별도 이슈에서 결정.

## 4. 출석 보상 — 웹에 기능 없음, i18n 잔재만 제거(Task B5)

```bash
grep -rn "label_attendance" --include="*.ts" --include="*.tsx" app components lib hooks
```

결과 0건 — 출석 라우트/컴포넌트/API 는 웹에 존재하지 않는다(`6d88a64c` 에서 이미 제거, #29).
남아 있던 `label_attendance_*` 12개 키(en 기준 `label_attendance_check`, `_ad_watch`, `_check_in`,
`_checked`, `_deadline`, `_weekly_bonus`, `_weekly_bonus_desc`, `_kst_notice`, `_already_checked`,
`_reward_received`, `_weekly_complete`, `_new_user_notice`)를 코드 미참조 확인 후 12개 언어 파일에서
일괄 삭제했다(Task B5).

**유지한 것:** `components/anti-abuse/RateLimitedDialog.tsx`, `lib/anti-abuse/handler.ts` 의
`attendance` 채널과 `error_anti_abuse_attendance_*` i18n 키. 이들은 출석 기능이 아니라 서버
rate-limit 응답 채널 및 알 수 없는 채널의 fallback 카피로 코드가 실제 참조하는 방어 인프라이므로
제거하지 않았다.

## 5. JMA 투표 차단 — 웹 가드 유지 확인

```bash
grep -n "jma\|partner" app/api/vote/submit/route.ts
```

`app/api/vote/submit/route.ts` 에서 `vote.partner === 'jma'` 조회 후 `403` 응답으로 차단하는 기존
가드가 voting-v2 신규 4키 계약 전환(Task A2, Worker A 소유) 이후에도 유지됨을 확인했다.

## 6. PIC CHART 점유율 표시 (#40) — 기반영 + 유일 2위 갭 1회 안내(Task B6) 신규 구현

`abd58923` (#40) 에서 진행중 투표 % 표시, 종료 투표 득표수+"표" 표시, 예정/0표 `—`, 관리자 괄호
병기가 `components/client/vote/common/vote-display-utils.ts` 의 `formatCandidateVote`/`formatVoteShare`
로 전체 적용 완료. 설계서(`docs/superpowers/specs/2026-07-21-vote-share-display-design.md` "제외 범위"
1항)에서 의도적으로 제외했던 "유일 2위 갭 1회 안내"만 미구현 상태였다.

**이번 작업(Task B6)에서 신규 구현:** `runnerUpGap()` 순수 함수(`vote-display-utils.ts`) — 진행중 투표에서
2위가 유일하고(동률 아님) 1위와의 갭이 양수일 때만 갭을 반환. `VotePodium.tsx` 의 2위 카드에 상세 진입당
1회, 5초간 노출되는 말풍선으로 렌더(`vote_runner_up_gap_notice` i18n 키, Task B7). 종료/예정 투표에는
표시하지 않는다.

## 7. 요약

| 항목 | 상태 | 비고 |
|---|---|---|
| PIC CHART area 계약 (#39) | 기반영, 재구현 없음 | 잔존 참조는 표시/매핑 전용 |
| 점유율 표시 (#40) | 기반영 + 유일 2위 갭 안내 신규(B6) | — |
| 투표 신청 개인정보 경계 | 웹에 적용 대상 없음 | 신청 기능 UI/API 자체가 없음 |
| `x-pathname` dead code | 범위 밖(§1-4 (c)) | 후속 이슈로 분리 |
| 출석 보상 | 웹에 기능 없음, i18n 잔재 제거(B5) | anti-abuse 방어 인프라는 유지 |
| JMA 투표 차단 | 유지 확인 | `app/api/vote/submit/route.ts` |
