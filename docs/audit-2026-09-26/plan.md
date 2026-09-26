# picnic-web 개선 실행 계획 (2026-09-26)

- 입력: `docs/audit-2026-09-26/` 의 4개 감사 보고서 — `structure.md`(STR-001~022), `performance.md`(PERF-01~24, 05a~05h), `design.md`(DES-001~031), `tests-security.md`(TEST-01~03, SEC-01~11, DEP-01~06). 스크린샷은 `screens/`.
- 방식: 4개 보고서의 중복 발견을 통합 이슈로 병합하고, 핵심 P0/P1 주장은 이 계획 작성 세션에서 **코드를 직접 열어 재검증**했다(§1). 코드·설정은 수정하지 않았고 이 파일 하나만 작성했다.
- 레포 사실: Next.js 15.5.23(App Router, webpack), Node 24, npm, Vercel 배포, **Vercel Preview 배포 없음 → 모든 검증은 로컬**(`npm run build && npx next start` + curl/Lighthouse), 머지 후 프로덕션 재측정.
- DB 스키마·RLS·RPC·마이그레이션의 소유는 **picnic-supabase**다. 이 레포에서는 DDL을 만들지도 실행하지도 않는다.

---

## 1. 핵심 주장 코드 검증 결과

계획의 우선순위를 좌우하는 P0/P1 주장을 파일을 직접 열어 확인했다. **기각 1건, 조정 2건**을 제외한 전 항목이 사실로 확인됐다.

### 1.1 확인된 사실 (발췌)

| 주장 | 검증 근거 (이 세션에서 직접 확인) | 판정 |
|---|---|---|
| Next 15.5.23 잠금 + AVIF 활성 (STR-001/DEP-01) | `package-lock.json:12571-12574` = 15.5.23, `next.config.js:74` `formats: ['image/avif', 'image/webp']`, `remotePatterns`에 S3 포함 | **확인** |
| sharp 0.34.5 / Vitest 4.1.10 잠금 (DEP-03/04) | `package-lock.json:14244-14247`, `:15747-15750` | **확인** |
| `x-pathname`/`x-url` 읽기 3곳·설정 0곳 (STR-003/PERF-02/DES-002) | grep 결과 읽기: `app/layout.tsx:42-43`, `app/[lang]/layout.tsx:77`, `BannerListFetcher.tsx:58`. setter 0건. `middleware.ts:84`는 원본 헤더 전달만 | **확인** |
| middleware가 페이지 요청마다 `getUser()`+`user_profiles.deleted_at` 조회, 오류 fail-open, matcher가 `/images` `/locales` `/favicon/*` 포함 (STR-004/PERF-06) | `middleware.ts:154`(getUser), `:163-167`(프로필), `:202-204`(fail-open 주석), `:217-219`(matcher). `getPreferredLanguage`(`:64`)는 정의만 있고 미호출 | **확인** |
| Provider 스택 중복 마운트 (STR-002/PERF-13) | `app/[lang]/layout.tsx:93-96` → `ClientLayout`(Navigation/Loading/Language/Auth/Notification/Dialog + overlay/알림/Analytics), `(main)/layout.tsx` → `components/layouts/MainLayoutClient.tsx:94-128`이 **동일 Provider 세트 재마운트**. `(mypage)/layout.tsx`는 `ClientLayout`을 한 번 더 + 결과를 쓰지 않는 `getServerUser()` 호출 | **확인** |
| PortOne: 클라이언트 `customData`의 `starCandy`/`bonusAmount`가 상품 원장 대조 없이 service-role RPC로 전달 (SEC-01) | `lib/payment/portone.ts:159-164`(클라이언트가 구성) → `webhook/route.ts:156-159`(추출) → `:244-261`(`process_portone_capture`에 그대로 전달). confirm(`confirm/route.ts`)은 양수·userId 일치만 검사 | **확인** |
| PortOne 웹훅: 서명 검증 전 `READY` 200 반환, 비표준 헤더, `JSON.stringify` HMAC (SEC-02) | `webhook/route.ts:54`(파싱), `:60-63`(READY 조기 200 — 서명 검증 **앞**), `:81-84`(x-portone-signature류), `webhook-helpers.ts`(JSON.stringify HMAC hex) | **확인** |
| PayPal: 캡처를 먼저 실행한 뒤 소유권·금액 검사 (SEC-03) | `capture-order/route.ts:99-105`(capture 호출) → `:157-164`(userId 대조) → `:167-203`(products DB 대조). 검사는 존재하나 순서가 문제 | **확인** |
| proxy-image: `*.supabase.co`/`*.supabase.in` 와일드카드, upstream Content-Type 그대로 반사, 크기 무제한 버퍼링 (SEC-04) | `proxy-image/route.ts` `SUPABASE_WILDCARD_SUFFIXES` + `endsWith`, `:162`대 Content-Type 반사·`arrayBuffer()` 전체 버퍼. redirect 재검사·10s timeout은 존재(유지할 긍정 통제) | **확인** |
| QNA messages: `formData()` 파싱 후 인증, 파일 수·크기·MIME 제한 없음, `parseInt(threadId)`, 원본 확장자 유지, 탈퇴 검사 없음 (SEC-07/STR-007) | `app/api/qna/messages/route.ts:6`(파싱) → `:22-28`(인증), `:46-97`(무제한 루프, `.html` 등 임의 확장자 가능), `:34`(parseInt) | **확인** |
| vote detail API: `select('*')` + 공개 시각 조건 없음, 순차 쿼리 (SEC-08/PERF-03/11) | `app/api/vote/[id]/detail/route.ts:24-70` — `deleted_at`만 필터, vote→item→reward 순차, 전체 열 반환 | **확인** |
| 1초 폴링 + 가시성 미확인 + deps `[]` 클로저 (PERF-03) | `VoteDetailFetcher.tsx:47` `pollingInterval={1000}`, `useVotePolling.ts:244-249`(setInterval, 가시성·종료 확인 없음), `:261-270`(lifecycle effect deps `[]`) | **확인** |
| `/api/votes`: `Math.max(1, parseInt(...))`은 NaN 전파, 전체 후보 조회 후 JS slice, `getCurrentUserContext` 무조건 호출 (SEC-10/PERF-10) | `app/api/votes/route.ts:68-72`(NaN: `Math.max(1, NaN)`=NaN), `:13-37`(제한 없는 임베드), `:134-155`(slice(0,3)) | **확인** |
| 투표 목록 SSR이 사용자 컨텍스트를 직렬 대기 (PERF-07) | `(main)/vote/page.tsx:84-96` — `getVotes`가 `safeStatusPromise`(→`getCurrentUserContext`)를 항상 await | **확인** |
| OptimizedImage가 `src`를 useEffect에서 결정, 로드 전 opacity-0 (PERF-04) | `components/ui/OptimizedImage.tsx` `currentSrc` 초기 `''`, useEffect에서 `setCurrentSrc`, `isInView && currentSrc` 게이트, `opacity-0→100` | **확인** |
| Sentry Replay 통합 상시 등록 (PERF-05a) | `instrumentation-client.ts:95` `Sentry.replayIntegration(...)` (샘플링은 env, 프로덕션 0/0은 보고서 측정) | **확인** |
| splitChunks 전체 교체 (PERF-05e/STR-020) | `next.config.js:112-116` — cacheGroups 병합 없이 새 객체로 교체 | **확인** |
| vote/[id] 페이지 `generateMetadata` 부재 + 레이아웃 canonical 기본값이 홈 (DES-001) | `app/[lang]/(main)/vote/[id]/page.tsx` 전체 30줄에 metadata 없음, `app/[lang]/layout.tsx:42` `canonical: lang==='ko' ? '/' : '/${lang}'` | **확인** |
| `primary` DEFAULT 보라 + 50~950 Tailwind 파랑 (DES-007) | `tailwind.config.js:117-130` | **확인** |
| 후보 카드 `div onClick`(role/tabIndex/키 없음), VoteDialog role/aria-modal 없음 (DES-003) | `VoteDetailPresenter.tsx:101`, `VoteDialog.tsx:53-68`(motion.div 직접 구현) | **확인** |
| 목록 득표율 분모가 TOP3 합 (DES-012) | `vote-service.ts:49-61`(slice(0,3) 후 반환) + `OngoingVoteItems.tsx:125` `totalVotes = sumVoteTotals(voteItems)` | **확인** |
| `supabase/migrations/*.sql` 1건 + 0바이트 Edge Function (STR-009) | `20251022090000_create_board_user_bookmark.sql`, `supabase/functions/voting-v2/index.ts` 0 byte | **확인** |
| predev/prestart/prebuild가 `gen:types \|\| true` 실행 (STR-010) | `package.json:17-27` (Vercel 빌드에서만 skip) | **확인** |
| engines 24.x vs `@types/node` ^20, jose+jsonwebtoken 병존, 번역 패키지가 runtime dep (STR-017/DEP-02) | `package.json:5-7`, `:91`, `:66-67`, `:54`. **jsonwebtoken 앱 코드 import 0건**(grep으로 이 세션 재확인) | **확인** |
| hreflang ko/en 2개뿐, vote 목록 title 한국어 고정 (DES-015/016) | `vote/page.tsx:28-40`, `metadata-utils` | **확인** |
| auth callback redirect base가 request origin (SEC-09) | `app/api/auth/callback/route.ts:28,45,104,141` — 단 `next`는 relative-only 방어 존재(`:11-12`) | **확인** |

### 1.2 기각·조정

| 항목 | 판정 | 사유 |
|---|---|---|
| **과제 전제 "npm(legacy-peer-deps)"** | **기각(구식 정보)** | 저장소에 `.npmrc` 없음, `npm config get legacy-peer-deps` = `false`, `npm ls --depth=0` 정상(이 세션 직접 실행). DEP-06대로 `dffb4b31`에서 이미 제거됨. **재도입 금지 상태를 유지**하고, 관련 메모리·문서의 "legacy-peer-deps 사용 중" 서술을 교정한다. |
| SEC-05 "media 버킷 non-UUID prefix 통과" | **조정** | 코드 사실은 맞지만, `signed-url/route.ts:130-140` 주석이 "non-UUID prefix(공유/공용 media)는 **의도적으로 허용**, avatars는 공개 읽기라 미검사"라고 명시한다. 결함이 아니라 *설계 리스크*다. 일괄 차단하면 공유 미디어가 깨지므로, 운영 객체 경로 조사(`media/private/*` 실재 여부, avatar_url 갱신 정책) **선행 후** Wave B에서 처리한다. |
| STR-001의 "Vercel Preview 확인" 검증 경로 | **조정** | 이 레포에는 Preview 배포가 없다(운영 사실). Next 패치 검증은 로컬 `npm run build && npx next start` + `/_next/image` smoke로 대체하고, 머지 후 프로덕션 curl로 재확인한다. |

보고서 간 상충 1건 — **splitChunks**: STR-020은 "측정 없이 바꾸지 말 것", PERF-05e는 "제거(S, 낮음)". performance.md가 이미 프로덕션 청크(712KB 단일 청크, 롱태스크 189ms)를 측정했으므로 **제거를 진행하되, PR 검증 조건으로 로컬 빌드 전후 청크 목록·크기 비교를 필수화**하는 것으로 조정한다(Wave A-5). Sentry 플러그인 옵션은 불변.

---

## 2. 통합 이슈 목록

심각도는 보고서 최고값, 검증 열은 §1 기준(✓=코드 확인, R=보고서 측정 신뢰, △=조건부/추정). 비용 S≤1일 / M 2–5일 / L 1주+.

### 2.1 P0–P1

| 통합ID | 주제 | 원 ID | 심각도 | 검증 | 효과 | 비용 | 회귀위험 | 처리 |
|---|---|---|---|---|---|---|---|---|
| U-01 | Next 15.5.24 미만 AVIF RCE + sharp/vitest 취약 패치 | STR-001, DEP-01, DEP-03, DEP-04 | **P0** | ✓ | critical RCE 면 제거 | S | 낮–중 | **A-1** |
| U-02 | PortOne 지급량을 클라이언트가 결정 | SEC-01 | **P0**(악용은 U-03 정상화에 조건부) | ✓ | 임의 과적립 차단 | M(완화)/L(intent) | 높 | **B-P1**(완화는 웹 레포만으로 가능 — PayPal route의 products 대조 선례 있음. intent 저장은 picnic-supabase) |
| U-03 | PortOne 웹훅 v2 규약 불일치(정상 웹훅 거부·READY 무서명 200) | SEC-02 | P1 | ✓ | 정상 적립 복구·위조 차단 | M | 높 | **B-P2** |
| U-04 | PayPal 소유권·금액 검사가 캡처 뒤 | SEC-03 | P1 | ✓ | 타인 주문 강제 캡처 차단 | M | 높 | **B-P3** |
| U-05 | proxy-image 타 테넌트 active content 반사·무제한 버퍼 | SEC-04 | P1 | ✓ | 동일 출처 XSS면·메모리 DoS 차단 | M | 중 | **A-3** |
| U-06 | service-role signed URL 경계(설계 리스크) | SEC-05 | P1△ | 조정(§1.2) | RLS 우회면 축소 | M | 높 | **B-S1**(운영 조사 선행) |
| U-07 | QNA multipart 인증 전 파싱·무제한 첨부 + 탈퇴 가드 이원화 | SEC-07, STR-007 | P1–P2 | ✓ | 자원 고갈·임의 파일 차단 | M | 중 | **A-3**(route 경계) / RLS는 이관 |
| U-08 | x-pathname 미주입 → html lang=ko 고정·광고 분기·VoteLite 전부 사문화 | STR-003, PERF-02, DES-002 | P1 | ✓ | 11개 로케일 lang 교정(1단계) | S(lang)/M~L(전체) | 1단계 낮 / 전체 높 | **A-4**(1단계) + **B-D1**(광고·VoteLite 결정) |
| U-09 | 전역 Provider 스택 이중·삼중 마운트 + 미사용 getServerUser | STR-002, PERF-13, DES-011 | P1 | ✓ | 하이드레이션·Auth 중복 제거, 크롬 통일 | M | 높 | **B-R1** |
| U-10 | middleware: 전 페이지 Auth+프로필 왕복, fail-open, 정적 자산 포함 matcher | STR-004, PERF-06 | P1 | ✓ | 자산 -20~27ms, Auth 왕복 축소 | S(matcher)/M(재설계) | matcher 낮 / 재설계 중 | **A-4**(matcher) + **B-R2**(getClaims·탈퇴검사 이동) |
| U-11 | 레이아웃 headers()·cookies()로 전 페이지 동적 렌더링(ISR 0%) | PERF-01, STR-012, PERF-22 | P1 | ✓(원인) R(측정) | 공개 페이지 CDN HIT·해외 TTFB | L | 중–높 | **B-R3** |
| U-12 | 투표 상세 1초 폴링(12일 16.3만 호출, DB 3,364s) | PERF-03 | P1 | ✓(코드) R(측정) | 호출 80%+ 감소, 이벤트 스케일 리스크 해소 | S–M | 낮–중 | **A-2** |
| U-13 | LCP 이미지가 SSR HTML에 없음(모바일 LCP 8.6–9.9s) | PERF-04 | P1 | ✓(코드) R(측정) | 모바일 LCP 직접 원인 제거 | M | 중 | **B-R4** |
| U-14 | 초기 JS 581KiB(Replay 상시 번들, 배럴 오염, splitChunks 교체, 날짜 2종, framer 등) | PERF-05a~h, STR-013, STR-020 | P1 | ✓(05a/05e 코드) R(크기) | 전 페이지 -38KB br+(1차) | S~L(세부별) | 낮–중 | **A-5**(05a/05e/배럴 데모) + **B-R5**(05c/05d/05f~h) |
| U-15 | 결제·인증·업로드 route와 middleware가 테스트·커버리지 밖, CI 부재 | TEST-01, STR-011, TEST-02 | P1 | R | 이후 모든 수정의 안전망 | M–L | 낮 | **A-6(선택)** + **B-T1** |
| U-16 | canonical이 홈 고정·OG 단일·hreflang 2개·플레이스홀더 메타 | DES-001, DES-015, DES-016, DES-031 | P1 | ✓ | 상세 2,916 URL 색인 정상화 | M | 낮 | **A-4** |
| U-17 | 핵심 투표 경로 키보드·스크린리더 조작 불가 | DES-003, DES-009 | P1 | ✓ | 접근성(핵심 전환 경로) | M | 중 | **B-D2** |
| U-18 | 비한국어 화면 한국어 하드코딩 + 번역 로드 전 빈 라벨 + 결제 12키 누락 | DES-004, DES-005, DES-006, DES-026, DES-028 | P1–P2 | R(일부 ✓) | 11개 언어 핵심 화면 번역 | 키 S / 문자열 M / SSR사전 M~L | 낮–중 | **A-4**(누락 키) + **B-D3**(문자열·SSR 사전) |
| U-19 | 운영 그래프 취약 26건(Sentry 경로·undici 등)·번역 도구가 runtime dep·jsonwebtoken 미사용 | DEP-02, STR-017 | P1 | ✓(구성) | 운영 install 면 축소 | S–M | 중 | **A-1**(이동·제거) + **B-U1**(Sentry 계열) |
| U-20 | 투표 조회 계약 4중화(SSR/API/클라/구형) + /api/votes 전량 조회 | STR-006, PERF-10 | P1 | ✓(votes) | pagination drift·DB 전송량 | S(재사용)/L(통합) | 낮/높 | **A-2**(buildVoteQuery 재사용) + **B-R6**(계약 통합) |
| U-21 | Supabase 서버 factory 3구현·2 환경변수 계약 | STR-005 | P1 | R | 타입·쿠키·환경변수 계약 통일 | M | 중–높 | **B-R7** |
| U-22 | 결제·OAuth 로그 redaction 부재·유실 가능 | STR-008 | P1 | R | 민감정보 노출·로그 유실 축소 | M | 중 | **B-P4** |
| U-23 | 스키마 소유권 충돌(migration 1건·빈 함수 잔존) | STR-009 | P1 | ✓ | db push 사고 방지 | M | 높(history 대조 필수) | **B-S2**(이관) |
| U-24 | gen:types가 predev/prestart에서 원격 스키마로 추적 파일 덮어씀 | STR-010 | P1 | ✓ | 작업 트리 변이·stale 타입 제거 | M | 낮–중 | **B-T2**(사용자 결정 #9) |

### 2.2 P2–P3 (묶음)

| 통합ID | 주제 | 원 ID | 심각도 | 비용 | 처리 |
|---|---|---|---|---|---|
| U-25 | vote detail 미공개 조건 미적용·전체 열 반환 | SEC-08 | P2 | S | **A-2** |
| U-26 | auth callback origin 신뢰(조건부 open redirect) | SEC-09 | P2 | S | **A-3** |
| U-27 | votes query NaN 허용 | SEC-10 | P3 | S | **A-2** |
| U-28 | 공개 API(popups/banners) CDN 캐시 없음 | PERF-09 | P2 | S | **A-2** |
| U-29 | 투표 목록 SSR 직렬 사용자 컨텍스트 | PERF-07 | P2 | S | **A-2** |
| U-30 | 진입 리다이렉트 함수 2회(272–408ms) | PERF-14 | P2 | S | **A-5** |
| U-31 | sitemap 3.7s·3중 생성 | PERF-08, STR-019 | P2 | S–M | **B-R8** |
| U-32 | 투표 상세 SSR 3RTT·RSC 201KB | PERF-11 | P2 | S–M | **B-R6** |
| U-33 | Firebase/GA 156KiB·FCM 매 로드 토큰 재등록 | PERF-12 | P2 | S | **B-R5** |
| U-34 | CLS(리워드 0.32)·styled-jsx SSR 미주입·전역 CSS 이원화 | PERF-15, DES-021, DES-022 | P2 | S–M | **B-D4** |
| U-35 | 이미지 파이프라인(이중 변환·TTL 1h·priority 남용) | PERF-16 | P2 | S–M | **B-R4** |
| U-36 | 마이페이지 내역 전량 조회 후 JS 집계 | PERF-17 | P2 | M | **B-S3**(RPC 이관) |
| U-37 | DB advisor(중복 인덱스 3개·RLS initplan·Auth 커넥션 10) | PERF-18 | P2 | M | **B-S4**(이관) |
| U-38 | presign 업로드 실파일 미검증·quota 없음 | SEC-06 | P2 | L | **B-S5**(quarantine, 일부 이관) |
| U-39 | PortOne verify 소유권 미확인 | SEC-11 | P3 | S | **B-P3**에 동승 |
| U-40 | 디자인 토큰 붕괴·대비 미달·다크모드/폰트 | DES-007, DES-008, DES-023, DES-024 | P2 | M–L | **B-D5**(색 결정 #4 선행) |
| U-41 | 미사용 UI 32파일(4,057줄)+dead 파일 16종+오류 UI 다계열 | DES-010, STR-014, STR-018, DES-013, DES-025 | P2 | M | **B-C1**(knip 교차 후 2–3 PR) |
| U-42 | 득표율 목록↔상세 불일치(TOP3 분모) | DES-012 | P2 | S | **B-D3**(결정 #12) |
| U-43 | 광고 앵커가 콘텐츠 가림·로그인에도 로드 | DES-014 | P2 | S+콘솔 | **B-D1**(결정 #5) |
| U-44 | 배너 링크 접근성 이름 없음·/ko 고정 | DES-018 | P2 | S | **B-D3** |
| U-45 | 랜드마크·h1·터치타깃·줄바꿈·모션 등 a11y/폴리시 잔여 | DES-017, 019, 020, 027, 029, 030 | P2–P3 | S each | **B-D2/D4** |
| U-46 | strict 완화(noImplicitAny off)·테스트 tsconfig 제외·useDebounce hook 규칙 | STR-015, TEST-02 | P2 | M | **A-6(부분)** + **B-T3** |
| U-47 | lint 전역 예외·next lint 폐기 예정·dev 스크립트 중복 | STR-016, DEP-05 | P2 | M | **B-T4** |
| U-48 | 메이저 드리프트(Next16/React19/Sentry11/Tailwind4/Supabase CLI 2) | DEP-05, STR-017 | P2 | L | **B-U1**(결정 #7) |
| U-49 | 폴더 소유 규칙 미강제(cn·hook·설정 중복) | STR-022 | P2 | M | **B-C2** |
| U-50 | Sentry 샘플링 하드코딩·폴링 트랜잭션 포함 | PERF-19 | P3 | S | **B-R5** |
| U-51 | /media 148개 일괄 렌더·카드별 1초 타이머·rewards 중복 조회·vote 첫 페인트 오버레이(조사) | PERF-20, 21, 23, 24 | P2–P3 | S each | **B-R5/R4** |
| U-52 | 테스트 경고 노이즈(SafeAvatar act·mock prop) | STR-021, TEST-03 | P3 | S | **B-T1** |

---

## 3. 실행 웨이브 설계

### Wave A — 이번 세션 구현 (최대 효과 · 낮은 위험 · 로컬 검증 가능)

선정 기준: ① 로컬에서 `tsc/lint/vitest/build`로 검증 가능, ② 결제·인증 자금 흐름과 DB를 건드리지 않음, ③ 파일 소유가 분리 가능, ④ 사용자 결정 없이 기본값으로 진행 가능(결정 필요 항목은 기본값 명시).

- **A-1** 의존성 보안 패치 (U-01, U-19 일부)
- **A-2** 투표 조회·폴링 비용 절감 + API 경계 (U-12, U-25, U-27, U-28, U-29, U-20 일부)
- **A-3** 요청 신뢰 경계 강화 — 비결제 (U-05, U-07, U-26)
- **A-4** 로케일·SEO 메타데이터 + middleware matcher (U-08 1단계, U-16, U-10 일부, U-18 일부)
- **A-5** 번들·설정 경량화 (U-14 일부, U-30)
- **A-6(선택, 세션 여유 시)** CI 안전망 (U-15 일부, U-46 일부)

### Wave B — 후속 (오너 결정 · picnic-supabase 이관 · 대규모 리팩터)

| 티어 | 내용 | 선행 조건 |
|---|---|---|
| **B-P (결제·인증, 각각 별도 PR + sandbox 검증 필수)** | B-P1 PortOne 지급량 서버 결정(U-02: 웹훅에서 `products` 대조·지급량을 DB 값으로 강제 — PayPal route 선례. 완전한 intent 저장은 picnic-supabase 협업) · B-P2 PortOne 공식 `Webhook.verify(rawBody, 표준헤더)` 전환(U-03) · B-P3 PayPal 캡처 전 주문 조회·소유권 검증 + verify 소유권(U-04, U-39) · B-P4 로그 redaction·flush(U-22) | **B-T1 계약 테스트 선행**, 결정 #2·#3, PortOne/PayPal sandbox 자격 |
| **B-R (성능·구조 리팩터)** | B-R1 Provider 단일화+레이아웃 셸 통합(U-09) · B-R2 middleware getClaims 전환·탈퇴검사 이동(U-10, 결정 #10) · B-R3 headers() 제거·ISR 전환(U-11, 결정 #8) · B-R4 OptimizedImage priority 서버 렌더+이미지 파이프라인(U-13, U-35) · B-R5 번들 2차(날짜 Intl화·LazyMotion·번역 이중로드·Firebase·Sentry 샘플링)(U-14, U-33, U-50, U-51) · B-R6 투표 계약 통합+상세 SSR 단일 쿼리(U-20, U-32) · B-R7 Supabase factory 통합(U-21) · B-R8 sitemap 소유자 단일화(U-31) | B-R1·R3는 회귀 높음 → 로컬 Playwright 스모크 세트 구축 후 |
| **B-D (디자인·i18n·a11y)** | B-D1 광고 게이팅 결정 실행(U-08 전체, U-43, 결정 #5·#11) · B-D2 투표 a11y(U-17, U-45) · B-D3 하드코딩 문자열 t()화·득표율 분모·배너 링크(U-18, U-42, U-44, 결정 #12) · B-D4 CSS 정리·CLS·랜드마크(U-34, U-45) · B-D5 디자인 토큰·대비(U-40, 결정 #4) | D5는 색 결정 선행 |
| **B-T (테스트·도구)** | B-T1 결제·인증·업로드 계약 테스트 확충(U-15, tests-security §3.3 표를 acceptance로) · B-T2 gen:types predev 분리(U-24, 결정 #9) · B-T3 테스트 tsconfig·strict 단계 상향(U-46) · B-T4 ESLint flat config·dev 스크립트 정리(U-47) | — |
| **B-S (picnic-supabase 이관)** | B-S1 storage 경계 조사·RLS(U-06) · B-S2 stale migration history 대조·이관(U-23) · B-S3 vote-history 집계 RPC(U-36) · B-S4 중복 인덱스·RLS initplan·Auth 커넥션(U-37) · B-S5 업로드 quarantine·quota(U-38) · 결제 intent 테이블/RPC(U-02 완전판) | **이 레포에서 DDL 실행 금지**, picnic-supabase에서 history 대조 후 |
| **B-U (메이저 업그레이드, 각각 단독 PR)** | @types/node 정렬(A-1에서 선행) → Sentry 9→11 → Supabase CLI 1→2 → Tailwind 3→4 → React 19 → Next 16(U-48, 결정 #7). `npm audit fix --force` 금지 | B-T1 CI 선행 |
| **B-C (정리)** | B-C1 dead code 2–3 PR(U-41: §1 검증 목록+knip 교차, Next 특수 파일·`typed-rpc.type-test.ts` 제외) · B-C2 폴더 소유 규칙·경계 lint(U-49) | 각 PR마다 build 통과 확인 |

---

## 4. Wave A — PR 분할

공통 검증(모든 PR): `npx tsc --noEmit` → `npm run lint` → `npx vitest run` → `npm run build`(로컬; `SENTRY_AUTH_TOKEN` 미설정 시 Sentry 플러그인 자동 비활성 — 정상). **PR 간 소유 파일 겹침 없음** — 5개 전부 병렬 가능(단, 동시 작업자 수는 오케스트레이션 정책 한도 내에서).

### A-1 `fix/deps-security-patch` — 의존성 보안 패치 (S)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `package.json`, `package-lock.json` |
| 변경 | ① next → **15.5.26+**(15.5 계열 유지, Next 16 금지) ② sharp → **0.35.4+** ③ vitest·@vitest/coverage-v8 → **4.1.11+**(4.1 계열) ④ `@iamtraction/google-translate` → devDependencies ⑤ `jsonwebtoken` 제거(§1에서 앱 코드 import 0건 재확인됨; 제거 직전 전체 grep 1회 재확인) ⑥ `@types/node` → ^24 |
| 불변조건 | React/Next/Sentry/Supabase **메이저 불변**, `npm ls --depth=0` 무오류, `.npmrc`/legacy-peer-deps 미도입, `jose` 유지 |
| 검증 | `npm ci && npm ls --depth=0` → 공통 검증 → `npm audit --omit=dev`에서 Next critical 소멸 확인 → `npx next start` 후 `curl -I "http://localhost:3000/_next/image?url=%2Fimages%2Flogo.webp&w=640&q=75"` 200 + AVIF/원격(S3) 이미지 1건 smoke → 머지 후 프로덕션 `curl -sI https://www.picnic.fan/ko/vote` |
| 신규 테스트 | 불필요(기존 2,074건 통과가 게이트) |
| 병렬 | 가능(다른 PR은 package*.json 금지) |

### A-2 `fix/vote-api-cost-guards` — 투표 폴링·조회 비용 + API 경계 (M)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `components/client/vote/detail/useVotePolling.ts`, `components/server/vote/VoteDetailFetcher.tsx`, `app/api/vote/[id]/detail/route.ts`, `app/api/votes/route.ts`, `app/[lang]/(main)/vote/page.tsx`, `components/server/vote/VoteListFetcher.tsx`, `app/api/popups/route.ts`, `app/api/banners/route.ts`, `__tests__/api/`(신규 테스트) |
| 변경 | **폴링(U-12)**: `document.hidden`이면 정지·`visibilitychange` 재개, `stop_at` 경과 투표 폴링 중단, 연속 오류 지수 백오프, lifecycle effect deps `[]` 클로저 버그 수정(user 갱신 반영), 간격은 `pollingInterval` prop 기본값을 **5000ms**로(결정 #1 전까지의 권장 기본값; 1초 유지 지시가 오면 fetcher의 prop 한 줄만 되돌림), 성공 토스트는 최초 1회·재연결 시로 제한(문구 자체는 B-D3에서 t()화). **detail route(U-25)**: 비인증·비관리자에 목록 API와 동일한 공개 조건 적용(미공개 404), `select` 명시 컬럼화, vote/item/reward 조회 `Promise.all` 병렬화, 공개 응답에만 `Cache-Control: public, s-maxage=2, stale-while-revalidate=5`(관리자 우회 응답은 `private`), **ETag/304 계약 유지**. **votes route(U-20/27)**: `buildVoteQuery` 재사용(`limit(…, { referencedTable: 'vote_item' })`+NULLS LAST), page/limit `Number.isSafeInteger` 범위 검증(위반 400), `getCurrentUserContext()`는 `status=admin`일 때만. **목록 SSR(U-29)**: `vote/page.tsx`·`VoteListFetcher`에서 admin 요청일 때만 사용자 컨텍스트 await. **공개 API(U-28)**: popups/banners 응답에 `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` |
| 불변조건 | `vote_total DESC NULLS LAST` 정렬·부분 인덱스 계약 불변, ETag/304 계약 불변, admin 가드 결과 불변, 응답 JSON shape 불변(스냅샷 테스트로 고정), TOP3/24 slice 동작 불변 |
| 검증 | 공통 검증 + 신규 테스트: ① 미공개 vote detail 비인증 404·공개 필드 부재 ② `?page=x&limit=x` → 400 ③ status=admin 비관리자 → ongoing 강등(기존 테스트 유지 확인) ④ detail 200/304에 캐시 헤더 존재 ⑤ 폴링 훅: hidden 시 fetch 미발생, `stop_at` 경과 시 정지(vitest+fake timers) ⑥ popups/banners 헤더. 로컬 `next start`에서 `/ko/vote/295` 폴링 주기·304 동작 육안 확인 |
| 병렬 | 가능 |

### A-3 `fix/request-boundary-hardening` — 비결제 신뢰 경계 (M)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `app/api/proxy-image/route.ts`, `app/api/qna/messages/route.ts`, `app/api/auth/callback/route.ts`, `__tests__/api/`(신규 테스트; A-2와 파일명 분리) |
| 변경 | **proxy-image(U-05)**: `SUPABASE_WILDCARD_SUFFIXES` 제거 → 자체 프로젝트 host(`NEXT_PUBLIC_SUPABASE_URL` host)+기존 소셜 도메인 exact 목록만, `https:` 스킴 강제, 허용 Content-Type을 raster 이미지로 제한(+선두 바이트 magic 검사, SVG/HTML 거부), Content-Length·스트리밍 상한 10MB, `X-Content-Type-Options: nosniff` 추가. **기존 redirect 재검사·10s timeout·429 처리 유지**. **QNA(U-07)**: 인증을 `formData()` 파싱 **앞**으로, Content-Length 사전 검사, 파일 수 ≤5·개별 ≤10MB·합계 ≤25MB(serverActions bodySizeLimit와 정합)·MIME allowlist(jpg/png/gif/webp/mp4/mov, 확장자는 MIME에서 유도 — 원본 확장자 신뢰 제거), threadId 정수 전체 문자열 검증, `qna_threads` 소유권 route 레벨 확인(RLS 보강은 B-S) — **탈퇴 사용자 검사 추가(STR-007 가드 통일, `app/actions/qna.ts:170-174`와 동일 기준)**. **auth callback(U-26)**: redirect base를 `NEXT_PUBLIC_SITE_URL` canonical로(미설정 시 현행 fallback), 예상 밖 Host는 canonical로 강제, 기존 relative-only `next` 방어·봇 예외 유지 |
| 불변조건 | 자체 Supabase host 아바타 프록시 정상 동작, 정상 QNA 텍스트/허용 첨부 흐름 불변(QNA·/media 기능 삭제 아님), OAuth 정상 로그인·`next` 딥링크 동작 불변, proxy-image 캐시 헤더(`s-maxage=86400`) 유지 |
| 검증 | 공통 검증 + 신규 테스트(tests-security §3.3 표 기반): ① mock fetch로 `text/html` upstream → 415 ② 타 테넌트 `*.supabase.co` → 403 ③ http 스킴 → 400/403 ④ 비로그인 대형 multipart → 파싱 전 401 ⑤ 파일 수·크기·MIME 초과 → 400/413/415 ⑥ `thread_id=1abc` → 400 ⑦ 탈퇴 세션 → 403 ⑧ callback `next=//evil.example` 등 → canonical `/` ⑨ 조작 Host 오류 redirect가 canonical 유지 |
| 병렬 | 가능. QNA 첨부 한도 기본값은 결정 #6 — 답이 오면 상수만 조정 |

### A-4 `fix/locale-seo-metadata` — html lang 1단계 + SEO 메타 + matcher (M)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `middleware.ts`, `app/layout.tsx`, `app/[lang]/layout.tsx`, `app/[lang]/utils/metadata-utils.ts`, `app/[lang]/(main)/vote/[id]/page.tsx`, `components/server/banner/BannerListFetcher.tsx`, `public/locales/*.json`(누락 키만 추가), 신규 테스트 |
| 변경 | **middleware(U-08 1단계·U-10 matcher)**: 요청 헤더에 검증된 `x-locale` 주입(경로에서 추출, **기존 인바운드 x-locale/x-pathname은 삭제 후 재설정** — 신뢰 경계), matcher에 확장자 자산 제외 추가(`png|jpe?g|webp|svg|gif|ico|json|txt|xml|js|css|woff2?|map` 등; in-app redirect·탈퇴 차단은 HTML 경로에서 그대로 동작). **`x-pathname`은 주입하지 않는다**(VoteLite·광고 분기 사문 상태 유지 = 동작 무변경, 결정 #5·#11 이후 B-D1). **app/layout.tsx**: lang 판별을 `x-locale` 우선으로(fallback 현행 유지) — 11개 로케일 `<html lang>` 교정. 광고 분기 코드는 손대지 않음. **BannerListFetcher**: 언어 결정을 `x-locale`로(배너 링크 언어 교정). **[lang]/layout.tsx(U-16)**: canonical 기본값을 현재 경로 기반으로 교정, og:locale 12개 매핑. **metadata-utils**: hreflang 12언어+`x-default` 생성 헬퍼, `google-site-verification`/`yandex` 플레이스홀더 제거, 404 나는 mask-icon 제거, manifest `/manifest.json`으로 단일화. **vote/[id]/page.tsx**: `generateMetadata` 추가(투표 제목·대표 이미지 OG·`/${lang}/vote/${id}` canonical·언어별 alternates; 조회는 `React.cache`로 감싼 경량 fetch 1회 — VoteDetailFetcher와 이중 조회 방지 확인). **locales(U-18)**: DES-006 누락 14키(결제 12 + 탈퇴 2)를 12개 언어에 추가(`npm run i18n:check` exit 0 확인). 브랜드 표기·title 템플릿 언어화는 결정 #4 대기(현행 '피크닠' 유지) |
| 불변조건 | in-app 브라우저 redirect·봇 UA 예외·쿠키 갱신 로직 불변, VoteLite/광고 분기 **비활성 상태 그대로**, URL 구조·redirects() 불변, `/ko` 페이지 lang=ko 유지 |
| 검증 | 공통 검증 + `npm run i18n:check`(exit 0) + 신규 테스트(락 파일 헤더 유닛: 경로→locale 추출) + 로컬 `next start`에서 `curl -s localhost:3000/en/vote \| grep 'html lang'` → `en`, `/ja/vote` → `ja`, `/ko/vote/295` canonical·hreflang 확인, `/images/logo.webp` 응답에 middleware 흔적 없음(로컬 로그) |
| 병렬 | 가능 |

### A-5 `refactor/bundle-config-lightweight` — 번들·설정 경량화 (S–M)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `next.config.js`, `instrumentation-client.ts`, `components/server/index.ts`, `components/client/index.ts` |
| 변경 | **Replay(U-14/05a)**: `replayIntegration` 상시 등록 제거 → 샘플링 rate>0일 때만 `Sentry.lazyLoadIntegration('replayIntegration')`(현 프로덕션 0/0이라 동작 무변경, -134KB raw). **splitChunks(U-14/05e)**: 커스텀 `config.optimization.splitChunks` 삭제(Next 기본 cacheGroups 복원) — §1.2 상충 조정에 따라 빌드 전후 비교 필수. **배럴(05b)**: `components/server/index.ts`에서 데모 컴포넌트(`ParallelDataFetching`, `ServerClientBoundary`, `VoteDataExample`) 재수출 제거, `components/client/index.ts`에서 이들만 참조하던 재수출 정리(소비처 0건 확인된 항목만; 실사용 named export는 유지 → 다른 파일 수정 불필요). **진입 리다이렉트(U-30)**: `redirects()`에 `/`→`/en/vote`, `/:lang(en\|ko\|ja\|…12개 정규식)`→`/:lang/vote` **추가**(기존 블록 수정 금지, 307 유지 — 결정 #7과 무관한 #7' 참조 →결정 #13). 비언어 stub 페이지는 fallback으로 유지 |
| 불변조건 | Sentry 앱 키 체인(`NEXT_PUBLIC_SENTRY_APPLICATION_KEY`·`unstable_sentryWebpackPluginOptions.applicationKey`·`thirdPartyErrorFilterIntegration`)·`hideSourceMaps`·`widenClientFileUpload`·`productionBrowserSourceMaps` 불변, 기존 redirects/rewrites/headers 블록 불변(추가만), `optimizePackageImports` 유지, stub 페이지·`supabase-proxy` rewrite 유지 |
| 검증 | 공통 검증 + **빌드 전후 `.next/static/chunks` 목록·크기 비교를 PR 본문에 기록**(splitChunks 회귀 게이트) + `next start`에서 `curl -sIL localhost:3000/` 리다이렉트 체인 1회로 단축·`/ko` → `/ko/vote` 확인 + 주요 페이지 로드 smoke(vote 목록·상세·mypage) |
| 병렬 | 가능(A-1과 파일 분리; 단 머지 순서상 A-1 이후 rebase 권장 — lockfile은 안 겹치나 빌드 기준 통일 목적) |

### A-6(선택) `chore/ci-safety-net` — CI + 테스트 타입 검사 (S–M)

| 항목 | 내용 |
|---|---|
| 소유 파일 | `.github/workflows/ci.yml`(신규), `tsconfig.test.json`(신규), `__tests__/utils/auth-redirect-validators.test.ts`(TEST-02의 시그니처 불일치 2건 수정), `vitest.config.ts`(coverage include에 `app/api/**`·`middleware.ts` 추가, 임계값은 기존 whitelist에만 유지) |
| 변경 | CI: `npm ci` → `npm ls --depth=0` → `npx tsc --noEmit` → `npx tsc -p tsconfig.test.json --noEmit` → `npm run lint` → `npx vitest run`. gen:types는 CI에서 실행하지 않음(네트워크 의존 금지) |
| 순서 | **A-1 머지 후**(vitest 4.1.11 기준으로 CI 고정). 다른 PR과 파일 무겹침 |
| 검증 | 로컬 동일 명령 통과 + GitHub Actions 1회 그린 확인 |

### 실행 순서 요약

```
병렬 그룹 1: A-1 ∥ A-2 ∥ A-3 ∥ A-4 ∥ A-5   (파일 소유 완전 분리)
순차:        A-6(선택) — A-1 머지 후
머지 권장 순서: A-1 → A-5 → A-2 → A-3 → A-4 (충돌 없음; 빌드 기준 통일 목적의 권장일 뿐)
```

각 PR은 워크트리에서 작업(`git -C ~/Repositories/picnic-web worktree add ../picnic-web-<slug> -b <branch>`), 커밋은 Conventional Commits, Preview가 없으므로 머지 전 로컬 검증 결과를 PR 본문에 첨부한다.

---

## 5. 사용자 결정 필요 목록

| # | 질문 | 선택지 | 권장 |
|---|---|---|---|
| 1 | 투표 상세 폴링 간격을 얼마로 할까요? (현행 1초, 12일간 16.3만 호출) | (a) 1초 유지+가시성 정지만 (b) **5초+가시성+종료 정지** (c) 10초 | **(b)** — A-2 기본값. 실시간 체감 저하가 우려되면 (a)로 prop 한 줄 롤백 |
| 2 | PortOne 웹훅을 공식 v2 표준(`webhook-id/timestamp/signature` + raw body)으로 전환해도 될까요? 현재 구현은 정상 웹훅을 거부할 수 있습니다 | (a) **전환(B-P2)** (b) 현행 유지 | **(a)** — 단, PortOne 콘솔의 webhook secret·버전·최근 401/400 비율 확인과 sandbox 자격 제공 필요 |
| 3 | PayPal sandbox 자격(클라이언트 ID/시크릿)을 제공할 수 있나요? B-P3(캡처 순서 수정) 검증에 필수입니다 | (a) 제공 (b) 불가(수정 보류) | **(a)** |
| 4 | 공식 브랜드 표기를 무엇으로 통일할까요? (현재 `피크닠` 26 / `피크닉` 4 / `Picnic` 혼재, 영어 페이지에도 한국어 title) | (a) 피크닠 (b) **한국어 '피크닉' + 영문 'Picnic' 언어별 템플릿** (c) 전부 Picnic | **(b)** — 결정 후 B-D3에서 title 템플릿 언어화 |
| 5 | 광고 정책: 로그인·/auth·투표 상세에서 앵커 광고를 제외하고, vote 라우트 광고 5초 지연(PICNIC-WEB-5C 완화)을 다시 살릴까요? 수익 영향이 있어 오너 판단이 필요합니다 | (a) **코드 경로 예외 + AdSense 콘솔 제외 설정** (b) 콘솔 설정만 (c) 현행 유지 | **(a)** — 콘솔 설정은 오너만 가능. 코드 측은 B-D1에서 x-pathname 대체 설계와 함께 |
| 6 | QNA 첨부 정책 기본값(파일 5개, 개별 10MB, 합계 25MB, 이미지+mp4/mov)을 승인하시나요? | (a) **승인** (b) 다른 한도 지정 | **(a)** — A-3 상수, 답이 오면 즉시 조정 |
| 7 | 메이저 업그레이드(B-U) 착수 시기와 순서(Sentry11 → Supabase CLI2 → Tailwind4 → React19 → Next16)를 승인하시나요? | (a) Wave A 안정화 후 순차 착수 (b) 보류 | **(a)** — 전부 개별 PR, `npm audit fix --force` 금지 |
| 8 | rewards/faq/notice를 ISR로 전환해도 될까요? (현재 force-dynamic; 개인화 데이터가 없다면 캐시 가능) | (a) 개인화 없음 확인 후 ISR (b) 현행 유지 | **(a)** — B-R3 선행 질문. 페이지에 사용자별 응답이 섞이는지 확인 후 |
| 9 | `predev`/`prestart`의 자동 `gen:types`(원격 스키마 → 추적 파일 덮어쓰기)를 제거하고 명시적 `schema:types:sync` 명령으로 바꿀까요? | (a) **분리** (b) 유지 | **(a)** — 온보딩 문서 갱신 포함(B-T2) |
| 10 | 탈퇴 계정 차단을 middleware 매 요청 조회에서 로그인/콜백/민감 API 지점으로 옮기고, `getUser()`를 `getClaims()` 로컬 검증으로 바꿔도 될까요? (JWKS에 ES256 키 확인됨, 현행 토큰 alg 확인 필요) | (a) 승인(B-R2) (b) 현행 유지 | **(a)** — 방어 계층 자체는 유지, 위치만 이동 |
| 11 | `VoteLiteClientLayout`(프로덕션 미검증, x-pathname 사문화로 한 번도 활성화된 적 없음)을 폐기할까요, 재검증 후 활성화할까요? | (a) **폐기(코드 삭제)** (b) B-R1 이후 재검증 | **(a)** — Provider 단일화(B-R1)가 원래 목적을 대체 |
| 12 | 목록 득표율 분모를 상세와 같은 '전체 후보 합'으로 통일할까요? 목록 노출 수치가 낮아져 보입니다(예: 34.26%→28.83%) | (a) **전체 합으로 통일** (b) 현행 유지+'TOP3 내 비중' 라벨 | **(a)** — B-D3. 수치 변화 공지 필요 여부는 오너 판단 |
| 13 | 진입 정적 리다이렉트(`/`→`/en/vote`)의 상태 코드는? | (a) **307 유지** (b) 308(영구) | **(a)** — 안정화 후 SEO 판단으로 308 전환 검토(A-5는 307) |
| 14 | Accept-Language/쿠키 기반 언어 자동 감지(현재 `getPreferredLanguage` 사문화, 모든 신규 방문이 `/en`)를 살릴까요? | (a) 미들웨어에서 1회 감지 후 최종 경로로 (b) 현행 /en 고정 | (a) 권장하되 SEO(리다이렉트 다양화) 검토 필요 — B-D1과 함께 |

---

### 5.1 결정 기록 (2026-09-26)

- Wave A 착수 승인: A-1~A-5 (A-6 CI 제외).
- #1 폴링 간격: **5초 + 숨김/종료 시 정지** 채택.
- #6 QNA 첨부 한도: 파일 5개·개별 10MB·합계 25MB·이미지+mp4/mov **승인**.
- 그 외 결정(#2~#5, #7~#14)은 미결 — Wave B 착수 전 확인.

### 5.2 Wave A 실행 결과 (2026-09-26)

| PR | 브랜치 | 구현 → 교차 리뷰 | 링크 |
|---|---|---|---|
| A-1 의존성 보안 패치 | `fix/deps-security-patch` | Opus → Codex Sol APPROVE | #80 |
| A-2 투표 폴링·API 비용 | `fix/vote-api-cost-guards` | Codex Sol → Opus, 재검증 2회 | #84 |
| A-3 요청 신뢰 경계 | `fix/request-boundary-hardening` | Codex Sol → Opus, 재검증 2회 | #81 |
| A-4 로케일·SEO·matcher | `fix/locale-seo-metadata` | Opus → Codex Sol, 재검증 2회 | #82 |
| A-5 번들·설정 경량화 | `refactor/bundle-config-lightweight` | Codex Sol → Opus, 재검증 2회 | #83 |

추가 결정: A-5 에서 splitChunks 제거로 처음 활성화되는 Sentry edge 는 트레이싱 옵션 없이 에러만 수집. PR 간 소유 파일 겹침 없음(머지 권장 순서 A-1 → A-5 → A-2 → A-3 → A-4).

Wave A 중 새로 확인되어 Wave B 로 넘긴 항목:
- **[긴급] `.sentryclirc` 에 Sentry auth 토큰이 커밋되어 있음** — 토큰 회전 후 파일을 추적 해제하고 CI/Vercel env 로 이전.
- `/api/vote/results` 미공개 투표 노출(SEC-08 잔여), `VoteDetailPresenter` 투표 성공 시 캐시 우회 갱신.
- `app/actions/qna.ts` `createQnaThreadAction` 무제한·원본 확장자 업로드, Vercel 4.5MB 본문 한도와 QNA 한도 정합.
- `concert2025`(force-static) `html lang=ko` — 루트 레이아웃 재구성(B-R1/R3).
- `PopupBannerLoader` fetcher 가 `res.ok` 를 확인하지 않음(현재는 200 [] 계약으로 방어).
- `common.loading` 키가 en 에만 존재.

## 6. 건드리면 안 되는 것 (전 웨이브 공통)

1. **QNA·`/media` 라우트와 기능** — 삭제 대상 아님. U-07·U-41 정리 중 `app/[lang]/(mypage)/mypage/qna/*`, `QnaMediaModal`, `components/client/media/*`를 지우지 않는다. 성능 개선은 페이지네이션 등 비파괴 방식만.
2. **`next.config.js` `redirects()` 기존 블록** — goong-hap/community/pic/novel·mypage posts/comments 호환 경계이자 롤백 지점. **수정·삭제 금지, 추가만 허용**(A-5). `supabase-proxy` rewrite도 참조 0건만으로 삭제 금지(access log 확인 전).
3. **DB 스키마·인덱스·RLS·RPC** — 전부 picnic-supabase 소유. 이 레포에 `supabase/migrations/*.sql` 추가 금지, `supabase db push` 실행 금지. 기존 stale migration은 B-S2에서 history 대조 후 이관.
4. **Vercel Preview 없음** — "Preview에서 확인" 류 절차 금지. 검증은 로컬 build/start + 테스트, 시각 확인은 머지 후 프로덕션.
5. **`buildVoteQuery`의 `vote_total DESC NULLS LAST` + `limit(…, { referencedTable: 'vote_item' })`** — 부분 인덱스(#79)와 한 쌍. 정렬 방향·NULLS 옵션 변경 금지.
6. **`VoteDetailClientOnly`의 `ssr:false`** — PICNIC-WEB-5C(hydration) 대응. LCP 개선은 정적 히어로 서버 렌더 방식으로만.
7. **Sentry 체인** — 앱 키(`NEXT_PUBLIC_SENTRY_APPLICATION_KEY`·`applicationKey`·`thirdPartyErrorFilterIntegration`), `hideSourceMaps`, `widenClientFileUpload`, `productionBrowserSourceMaps`. Replay·splitChunks 정리 시에도 그대로.
8. **`/api/vote/[id]/detail`의 ETag/304 계약** — 폴링 클라이언트가 전제. 캐시 헤더는 추가만.
9. **middleware의 인앱 브라우저 redirect·봇 UA 예외·탈퇴 차단 동작** — 위치를 옮겨도 동작은 유지(B-R2). matcher 축소 시 HTML 경로 커버 유지 확인.
10. **`ConsentAwareAdsense` 동의 게이팅** — 광고 최적화가 동의 로직을 우회하면 안 됨.
11. **`/[lang]/concert2025`의 `force-static`** — 유일한 CDN HIT 페이지.
12. **`images.remotePatterns` 목록** — 항목 제거 금지(기존 이미지 파손).
13. **비언어 stub 페이지**(`app/page.tsx`, `app/vote/*`, `app/mypage/page.tsx`, `app/concert2025/page.tsx`) — dead route 아님. A-5 정적 redirect 추가 후에도 fallback으로 유지.
14. **`components/layouts/Footer.tsx`의 사업자 법정 표기** — 임의 삭제·축약 금지.
15. **`VoteStatusFilter`의 listbox 접근성 패턴, `useBannerCarousel`의 reduced-motion·비가시 정지, `useVoteDetail`의 `timeZone: 'Asia/Seoul'`** — 모범 사례·mismatch 방지 장치. 유지.
16. **`lib/supabase/typed-rpc.type-test.ts`** — `@ts-expect-error` 컴파일 타임 테스트. unused로 삭제 금지.
17. **Knip/정적 스캔의 unused 목록 일괄 삭제 금지** — Next 특수 파일·서비스 워커·동적 키(`label_vote_${category}` 등) 오탐 포함. B-C1에서 수동 교차 확인 후 소묶음 PR.
18. **`legacy-peer-deps` 재도입 금지** — 현재 꺼져 있음(§1.2). `--legacy-peer-deps` 문서화도 금지. peer 충돌은 패키지별 해결.
19. **`npm audit fix --force` 금지** — 보안 patch와 메이저 마이그레이션 분리.
20. **PortOne 웹훅 검증을 "동작시키기 위해" 느슨하게 만들기 금지** — READY 조기 성공 분기 유지·서명 완화 금지, 공식 raw-body 검증이 기준(B-P2).
21. **proxy-image의 redirect 재검사 로직** — 제거 금지, exact host·MIME·크기 검증은 그 위에 추가(A-3).
22. **`public/locales/*.json` 파일 위치** — 서버 fs 읽기와 클라이언트가 공유. 이중 로드 정리(B-R5) 시에도 위치 불변.
23. **Jira 이슈 상태** — 작업 완료를 이유로 `검토중` 등으로 자동 전환하지 않는다(전역 규칙).

---

## 7. 부록

### 7.1 레포 사실 교정

- **npm legacy-peer-deps: 이미 제거됨.** `.npmrc` 부재·`npm config get legacy-peer-deps=false`·`npm ls --depth=0` 정상(이 세션 실행). 과제 전제·메모리의 "legacy-peer-deps 사용 중" 서술은 구식이며, 후속 작업 지침은 "재도입 금지 유지"다.
- **Preview 배포 없음**은 재확인된 전제로, 본 계획의 모든 검증 명령은 로컬 기준으로 작성했다.

### 7.2 Wave A 공통 검증 명령

```bash
npm ci && npm ls --depth=0
npx tsc --noEmit
npm run lint
npx vitest run
npm run build          # 로컬: SENTRY_AUTH_TOKEN 없이 플러그인 자동 비활성(정상)
npx next start         # smoke: 아래 curl
curl -sI localhost:3000/ko/vote | grep -iE 'HTTP|cache-control'
curl -s  localhost:3000/en/vote | grep -o '<html lang="[a-z-]*"'   # A-4
curl -sIL localhost:3000/ | grep -iE 'HTTP|location'               # A-5
npm run i18n:check                                                  # A-4 (exit 0)
npm audit --omit=dev                                                # A-1 (Next critical 소멸)
```

### 7.3 머지 후 프로덕션 재측정 (performance.md §7 재사용)

```bash
curl -s -o /dev/null -D - -H 'Accept-Encoding: br' \
  -w '\ncode=%{http_code} ttfb=%{time_starttransfer} size=%{size_download}\n' \
  https://www.picnic.fan/ko/vote | grep -iE 'cache-control|x-vercel-cache|code='
curl -s -o /dev/null -L -w 'redirects=%{num_redirects} total=%{time_total}s final=%{url_effective}\n' https://picnic.fan/
npx -y lighthouse@13.5.0 https://www.picnic.fan/ko/vote --only-categories=performance \
  --output=json --chrome-flags="--headless=new"   # 레포 밖 디렉터리에서
```
