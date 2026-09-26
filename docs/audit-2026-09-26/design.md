# picnic-web UI/UX·디자인 시스템·접근성·반응형·i18n·SEO 감사

- 감사일: 2026-09-26 (KST 01:10~01:30 측정)
- 범위: 디자인 토큰(`tailwind.config.js`·전역 CSS·하드코딩 색/임의값), 공통 컴포넌트 중복, 모바일 반응형, 다크모드, 접근성, 로딩/오류/빈 상태, 레이아웃 시프트(CLS), i18n, SEO 메타데이터
- 대상: 소스(`app/`, `components/`, `stores/`, `lib/`, `public/locales/`)와 프로덕션 `https://www.picnic.fan`(`next-sitemap.config.js`의 `siteUrl`과 `app/[lang]/constants/static-pages.ts:1`로 확인)
- 방식: 읽기 전용 명령, 정적 스캔, 프로덕션 SSR HTML(curl), Playwright MCP 실측(390px·1440px). 로그인·결제·투표 제출·동의 클릭 같은 상태 변경 동작은 하지 않았다. `next build`는 실행하지 않았다.
- 산출물: 이 파일과 `docs/audit-2026-09-26/screens/*.png`(스크린샷 12장). 스캔 스크립트와 ESLint 설정은 세션 scratchpad에만 두었고 레포에 쓰지 않았다.
- 교차 참조: 같은 날 작성된 `docs/audit-2026-09-26/structure.md`의 STR-002(Provider 중복), STR-003(x-pathname), STR-012(Metadata helper 모순), STR-014(죽은 파일)와 원인이 겹치는 항목은 여기서 **디자인·UX 영향** 위주로 적는다.
- 스키마: DB 변경이 필요한 제안은 없다. 필요해질 경우 "picnic-supabase 이관 필요"로 표시했다.

## 요약

치명적인 결함(P0)은 없다. 다만 사용자와 검색엔진이 바로 체감하는 **P1이 4건**이다. ① 투표 상세를 포함한 대부분 페이지의 canonical이 사이트 홈을 가리키고, title·OG가 `피크닠` 하나로 고정돼 있다. sitemap에 올라간 투표 상세 URL 2,916개가 모두 홈을 canonical로 선언한다. ② `<html lang>`이 모든 로케일에서 `ko`다. 원인은 레이아웃이 읽는 `x-pathname` 헤더를 어디서도 만들지 않는 것이다. 같은 원인으로 `/download` 광고 제외와 vote 라우트의 광고 지연도 프로덕션에서 작동하지 않는다. ③ 투표의 핵심 경로인 후보 카드(`div onClick`)와 투표 다이얼로그가 키보드·스크린리더로 조작되지 않는다. ④ 영어 등 비한국어 투표 상세에 한국어 문자열(상태·날짜·총 표수·검색 placeholder·토스트)이 하드코딩돼 노출된다.

디자인 시스템은 사실상 작동하지 않는다. 기본 Tailwind 팔레트 클래스가 1,679회(152파일) 쓰이는 반면 브랜드 토큰 클래스는 496회다. 게다가 `primary`는 DEFAULT만 브랜드 보라(#9374FF)이고 50~950 단계는 Tailwind 기본 **파랑**이라, `bg-primary`는 보라로, `bg-primary-500`은 파랑으로 렌더링된다(122회 사용). 공통 atom 채택률도 낮다. `Button`은 3파일, `Input`·`Badge`는 사실상 0이고, raw `<button>`이 64파일에 117개 있다. 정적 스캔 기준 미사용 UI 파일은 32개, 4,057줄이다. 모달은 Headless UI 기반 공통 `Dialog`가 있는데도 6곳이 직접 구현했고, 그중 `role="dialog"`·`aria-modal`을 가진 곳은 0곳이다.

실측 CLS는 0.017~0.041로 양호하고, 390px에서 가로 오버플로는 없다. 대신 클라이언트 번역 함수가 SSR과 하이드레이션 직후 빈 문자열을 반환한다(`stores/languageStore.ts:170-176`). 그래서 탭·라벨이 늦게 채워지거나 영어에서 한국어로 바뀌어 보인다(SSR HTML에 "In Progress" 7회). 결제 관련 12개 키는 6개 언어에 없어 해당 사용자에게 빈 라벨로 표시된다. 다크모드는 미지원이지만 일관되게 라이트로 고정돼 있어 깨지지는 않는다.

| 심각도 | 건수 | ID |
|---|---:|---|
| P0 치명 | 0 | — |
| P1 높음 | 4 | DES-001 ~ DES-004 |
| P2 중간 | 14 | DES-005 ~ DES-018 |
| P3 낮음 | 13 | DES-019 ~ DES-031 |

## 실행 근거

| 명령·도구 | 결과 |
|---|---|
| `npm run -s i18n:check` | exit 1. 스캔 515파일, 코드 사용 키 349, 언어 파일 합집합 959. 누락: bn·id·my·th·tl·vi 각 16(동적 키 오탐 2 포함), en·es·ja·ko·zh-cn·zh-tw 각 4. 미사용 키 언어당 613(en 614). zh-cn·zh-tw는 `common.loading` 불일치 |
| `npx next lint --no-cache` | "No ESLint warnings or errors". 여러 lockfile 경고가 출력됨. `next/core-web-vitals` 프리셋은 jsx-a11y 규칙 일부만 포함하므로 아래 추가 검사를 돌렸다 |
| `eslint --no-inline-config -c <scratchpad>/a11y.config.mjs app components` (jsx-a11y **strict**, 레포 무수정) | 246개 TSX 중 17개 파일에서 검출. click-events-have-key-events 15, no-static-element-interactions 14, mouse-events-have-key-events 6(`app/not-found.tsx`), media-has-caption 4, no-noninteractive-element-interactions 1, interactive-supports-focus 1, no-noninteractive-element-to-interactive-role 1(`VoteStatusFilter.tsx:218`, 오탐에 가까움) |
| 같은 방식, `alt-text`(Image·OptimizedImage→img 매핑)·`control-has-associated-label` | alt-text 0건. control-has-associated-label 18건 중 실제 아이콘 전용·무라벨 버튼은 5건(`VoteSearch.tsx:105`, `GridView.tsx:231`, `GridView.tsx:254`, `VoteDialog.tsx:79`, 미사용 `LoginDialog.tsx:19`). MyPage 메뉴 13건은 depth 한계에 따른 오탐 |
| 토큰 스캔(scratchpad `tokens.mjs`, 513개 TS/TSX) | 기본 팔레트 1,679회/152파일. 계열 15개(gray 1,048, blue 192, red 141, yellow 84, green 65, orange 32, purple 27, amber 20, cyan 17, pink 14, indigo 11, teal 8, emerald 4, rose 4, violet 3). 브랜드 토큰은 primary 285 + 기타 211. `primary-<단계>` 122회/30파일. 6자리 hex 56종(141회/16파일). 임의값 160회/48파일(`text-[10px]` 13, `text-[11px]` 11). `style={{` 133회/31파일. `dark:` 0 |
| radius 사용 분포 | rounded-lg 235, rounded 216, rounded-full 176, rounded-xl 99, rounded-2xl 24, rounded-md 22, rounded-3xl 6 |
| 컴포넌트 사용처 스캔(scratchpad `usage.mjs` + import 경로 grep) | 아래 "컴포넌트 중복 목록" 참조. 미사용 UI 파일 32개, 4,057줄(`wc -l`) |
| 한글 하드코딩 스캔(scratchpad `hangul.mjs`, 주석·console·throw 제외) | 88개 TSX 파일, 364줄. 다국어 사전 맵(open-in-browser·global-error·privacy·terms·Footer)을 포함한 상한값 |
| 대비 계산(scratchpad `contrast.mjs`, WCAG 2.x 공식) | 흰 글씨 on #9374FF 3.40:1, on orange-500 2.80:1, on secondary 1.27:1, on sub 1.20:1, on point 1.80:1. gray-400 on 흰색 2.54:1 |
| curl(프로덕션 SSR HTML) | 페이지별 title·canonical·hreflang, `sitemap.xml` 3,228 URL(투표 상세 2,916), `robots.txt`, AdSense props(`delayUntilIdle:false`, `idleTimeout:1200`) |
| Playwright MCP | 홈·투표 목록·투표 상세(ko/en)·마이페이지(비로그인)·로그인·404를 390px·1440px로 측정. 콘솔, DOM 접근성 검사, layout-shift·LCP 수집, 다크모드 에뮬레이션 |
| 미실행 | `npx tsc --noEmit`·`npx vitest run`: 디자인 근거와 직접 관계가 없어 실행하지 않았다(structure.md 실측: tsc 0 오류, vitest 2,074건 통과). `next build`: 금지 |

### 측정 조건과 한계

- 모바일은 뷰포트 폭만 390×844로 바꾼 데스크톱 Chromium이다. 터치, UA, DPR은 에뮬레이션하지 않았다. 헤드리스 창의 세로 스크롤바가 15px를 차지한다(`overflowX` = -15).
- CLS는 로드 후 약 5초 동안 `layout-shift` 엔트리(입력 직후 제외)를 1회 합산한 값이다. web-vitals의 세션 윈도우 값이 아니고 필드 데이터(CrUX)도 아니다.
- 광고 내용은 측정 위치(한국 IP·KST)와 시점에 따라 달라진다. 광고 요소는 DOM 밖(iframe·shadow)에 있어 식별이 부분적이며, 해당 항목은 "(추정)"으로 표시했다.
- 로그인이 필요한 화면(투표 다이얼로그, 결제, 마이페이지 하위)은 코드로만 검토했다.

## 페이지별 관찰

| 페이지 | URL(측정) | 스크린샷 390 / 1440 | `<html lang>` | title | canonical | h1 | CLS 390 / 1440 | LCP 390 / 1440 | 콘솔 |
|---|---|---|---|---|---|---:|---|---|---|
| 홈 | `/` → 307 `/en` → 307 `/en/vote` | `screens/home-redirect-en-vote-390.png` / `screens/home-redirect-en-vote-1440.png` | ko ✗ | 투표 \| 피크닠 | `https://www.picnic.fan/en/vote` | 0 | 0.0345 / 0.0172 | 2,556ms / 1,596ms | 오류 0, 경고 1 |
| 투표 목록 | `/ko/vote` | `screens/vote-list-ko-390-full.png`(전체 페이지) / `screens/vote-list-ko-1440.png` | ko | 투표 \| 피크닠 | `https://www.picnic.fan/ko/vote` | 0 | (홈과 동일 템플릿) | — | 오류 0, 경고 8 |
| 투표 상세 | `/ko/vote/295`, `/en/vote/295` | `screens/vote-detail-ko-390.png`, `screens/vote-detail-en-390.png` / `screens/vote-detail-ko-1440.png` | ko(en에서도) ✗ | 피크닠 | `https://www.picnic.fan` ✗ | 1 | 0.0406 / 0.0167 | 1,188ms / 528ms | 오류 0, 경고 1 |
| 마이페이지(비로그인) | `/ko/mypage` | `screens/mypage-guest-ko-390.png` / `screens/mypage-guest-ko-1440.png` | ko | 피크닠 | `https://www.picnic.fan` ✗ | 1 | 0 / — | — | 오류 0, 경고 1~3 |
| 로그인 | `/ko/login` | `screens/login-ko-390.png` / `screens/login-ko-1440.png` | ko | 피크닠 | `https://www.picnic.fan` ✗ | 0 | — | — | 390: 경고 2 / 1440: 오류 3 |
| (추가) 404 | `/ko/this-page-does-not-exist-audit` | — / `screens/notfound-ko-1440.png` | ko | Picnic | — | 1 | — | — | 오류 1(본문 미확인, 404 응답 리소스 오류로 추정) |

공통 콘솔 경고로 `⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음`이 비로그인 상태의 모든 페이지에 1회씩 출력된다. `logo.webp` preload 미사용 경고(`w=32`, 로그인은 `w=48`)는 `/ko/vote`에 4분간 머무는 동안 **44회, 5초 간격**으로 반복됐다. 배너 자동재생 주기(`useBannerCarousel.ts:11` `AUTO_PLAY_DELAY = 5000`)와 일치하므로 상위 트리 리렌더를 의심할 수 있다(추정).

### 1. 홈 `/` (실제 도착: `/en/vote`)

- 홈 전용 화면은 없다. `app/page.tsx`가 `/${DEFAULT_LANGUAGE}`(en)로, `app/[lang]/page.tsx`가 `/${lang}/vote`로 리다이렉트한다. 첫 방문자는 쿠키나 Accept-Language와 무관하게 영어로 들어간다. `middleware.ts`의 `getPreferredLanguage()`는 정의만 있고 호출되지 않는다.
- 영어 페이지인데 `<html lang="ko">`이고 title은 `투표 | 피크닠`, description과 og:title도 한국어다 → DES-002, DES-015.
- 390px 하단에 광고 앵커로 보이는 칩(✕ + "음악 자료실", 한국어)이 떠서 첫 투표 카드의 득표율 줄을 가린다 → DES-014.
- 서브 내비(Voting/Reward/Media/Star Candy Rec…)가 390px에서 잘리고 회색 가로 스크롤바가 보인다 → DES-021.
- 오렌지 BETA 배너는 흰 글씨 2.80:1(10~12px), 활성 탭 "Voting"과 칩 "ALL"은 흰 글씨 on #9374FF 3.40:1(12~14px)이다 → DES-008.
- 배너 캐러셀 점 버튼 8개가 10×10px다. 390px에서 24px 미만인 조작 요소가 11개, 12px 미만 텍스트 요소가 69개다(`#2` 10px, 그룹명 10px, 득표율 11px) → DES-019.
- 배너 링크 8개가 `aria-label="" title=""`, 이미지 `alt=""`라 접근성 이름이 없다. 링크가 `https://www.picnic.fan/ko/vote/210`처럼 `/ko`로 고정돼 영어 사용자를 한국어 페이지로 보낸다 → DES-018.
- 카드 카운트다운 "00 16 44 14"에 단위가 없고, 바로 옆에 "Just now/방금 전"이 붙어 의미가 모호하다 → DES-027.
- 랜드마크: `main` 2개(중첩), `nav` 0, skip link 0, `h1` 0 → DES-017.
- 1440px: 레이아웃은 안정적이다(3열 카드, 3-up 배너). LCP 요소는 배너 이미지(1,596ms), 주 시프트는 `MAIN.flex-1 container`(0.0107, 476ms)다.

### 2. 투표 목록 `/ko/vote`

- SSR HTML(curl)은 `<html lang="ko">`다. 카드 상태 라벨 "In Progress"가 **영어로 7회** 들어 있고 하이드레이션 후 "진행중"으로 바뀐다. 탭 라벨(투표/리워드…)은 SSR에 없다. `BAILOUT_TO_CLIENT_SIDE_RENDERING` 7회, `animate-pulse` 57회로, 초기 HTML이 스켈레톤 위주다 → DES-005, DES-025.
- 필터 칩 `ALL / PICNIC / PIC CHART / MUSICAL / SPOTLIGHT`가 한국어 페이지에서도 영어다(`stores/voteFilterStore.ts:30-34`) → DES-028.
- 1440px 우하단의 광고 앵커 추정 칩("온라인 이미지 갤러리")이 3번째 카드의 순위·이름을 가린다 → DES-014.
- 카드의 득표율(예: 하성운 **34.26%**)이 같은 투표 상세(**28.83%**)와 다르다. 목록은 TOP3 합계를 분모로 쓴다 → DES-012.
- 390px 전체 페이지 높이는 약 3,870px(카드 7개)이고 가로 오버플로는 없다. 칩 줄은 "MUSICAL"에서 잘리는데 스크롤 힌트(페이드 등)가 없다.
- 카드 하단 리워드 띠(연두 배경), 상태 배지(파랑), 제목 하단선(보라), 순위 원(노랑·회색·주황)이 한 카드 안에서 서로 다른 팔레트를 쓴다 → DES-007.

### 3. 투표 상세 `/ko/vote/295`, `/en/vote/295`

- title `피크닠`, canonical `https://www.picnic.fan`, og:title `피크닠`, og:url 없음. hreflang ko-KR은 `https://www.picnic.fan`인데, 이 URL은 `/en/vote`로 리다이렉트된다 → DES-001, DES-016.
- 후보 115명이 `div onClick` 카드(cursor:pointer)로 렌더링돼 Tab으로 도달할 수 없다. 검색 input에는 라벨이 없고 placeholder "115명 중 검색..."만 있다 → DES-003.
- `/en/vote/295`: 토스트 "실시간 연결 성공 / 투표 결과가 실시간으로 업데이트됩니다.", 배지 "진행 중", 기간 "2026년 9월 12일 오후 06:00 ~ 2026년 9월 26일 오후 06:00", "총 94,863 표", "115명 중 검색..."이 모두 한국어다 → DES-004.
- 토스트가 페이지 로드마다 뜬다. 390px에서는 BETA 배너와 탭을 덮는다 → DES-026.
- 모바일 문서 높이는 13,899px다(후보 115명 전체를 2열로 렌더링). 검색이 있어 치명적이지는 않지만 순위 점프나 페이지 분할 같은 이동 수단이 없다.
- 날짜가 "…9월 26 / 일 오후 06:00"처럼 단어 중간에서 줄바꿈된다 → DES-020.
- 제목 h1은 blue→purple 그라데이션 텍스트이고, 4위 이하 순위 배지도 blue→purple이다. 브랜드 보라 단색과 다르다 → DES-007.
- CLS 0.0406(390): 주 시프트는 `MAIN`(0.0197, 266ms)과 포디움 컨테이너(0.0169, 1,186ms)다.

### 4. 마이페이지(비로그인) `/ko/mypage`

- 투표 섹션과 크롬이 다르다. BETA 배너와 서브 내비가 없고, 헤더 하단선이 전폭이 아닌 컨테이너 폭이며, 로고 x좌표가 89px에서 105px로 이동한다(1440px 스크린샷 비교). 투표→마이페이지 이동 시 헤더가 튄다 → DES-011.
- 히어로는 **파랑** 그라데이션이고, 활동 내역·서비스 정보 카드는 초록·파랑 두꺼운 그라데이션 테두리다. 투표 섹션의 보라 기반 시각 언어와 다르다 → DES-007.
- 390px에서 "환영합 / 니다!", "해제하세 / 요"처럼 한국어가 단어 중간에서 줄바꿈된다(`word-break: normal`) → DES-020.
- 본문은 "피크닉에 오신 것을 환영합니다!"인데 탭 title은 "피크닠"이다 → DES-015.
- 저대비 텍스트 3개: 헤더 "Beta" 2.80:1(10px), 버전 표기 `v 20260925.0800` 2.54:1, 구분자 `|` 2.54:1 → DES-008.
- 헤더 언어 버튼은 접근성 이름이 국기 이모지 "🇰🇷"뿐이고 크기는 40×32px다 → DES-019.
- CLS 0, 조작 요소 14개 모두 이름이 있다. 클릭 가능한 div는 0개다(양호).

### 5. 로그인 `/ko/login`

- `h1`·heading·`main`이 모두 없다. 핵심 문구 "피크닉에서 특별한 순간을 발견하세요"가 제목 요소가 아니다 → DES-017.
- 버튼은 양호하다. Google·Apple 285×48px, 뒤로가기 40×40px에 `aria-label="뒤로가기"`가 있다. 약관 링크는 높이 15px다 → DES-019.
- 로그인 화면에서도 AdSense가 동작한다. DOM에 `svg[aria-label="쇼핑 앵커 닫기"]`가 있고, 1440px 콘솔에 `cksync.yahoo.co.jp/sspsync` 400 오류가 3건 찍힌다 → DES-014.
- 링크 색은 blue-600이다(브랜드 보라 아님). 본문 속 브랜드 표기는 "피크닉"이다 → DES-007, DES-015.

### 6. (추가) 404 `/ko/this-page-does-not-exist-audit`

- HTTP 404, title `Picnic`(다른 페이지는 `피크닠`).
- 루트 `app/not-found.tsx`가 렌더링된다. Tailwind 유틸리티가 로드되지 않는다. 프로브 요소 `class="flex hidden"`의 computed display가 `block`이었다. 그래서 인라인 style 16개와 hex 27개로 구현돼 있다 → DES-022.
- 장식 도형(베이지 사각형)이 본문 문장 "요청하신 페이지가…"와 겹친다. 12개 언어 선택 버튼은 현재 언어를 `aria-pressed`나 `aria-current`로 표시하지 않는다.

### 반응형·다크모드·CLS 요약

- 반응형: 측정한 모든 페이지가 390px에서 가로 오버플로 없이 동작한다. 1440px에서는 콘텐츠 폭 1,280px(`container`)로 정렬된다. 문제는 세부 요소다. 가로 스크롤 탭의 스크롤바 노출(DES-021), 32px 헤더 아이콘·10px 점 버튼(DES-019), 한국어 줄바꿈(DES-020), 목록 칩 스크롤 힌트 부재, 긴 상세 페이지가 있다.
- 다크모드: `dark:` 클래스 0개, CSS의 `prefers-color-scheme: dark` 규칙 0개, `color-scheme` 선언 없음. 다크 에뮬레이션에서도 라이트로 동일하게 렌더링된다. body 배경은 create-next-app 기본 그라데이션(rgb 214,219,220 → 흰색)이 남아 있다 → DES-023.
- CLS: 실측 0.0167~0.0406으로 "좋음"(≤0.1)이다. 기여 요인은 ① 번역·언어 교체로 텍스트가 늦게 채워지는 `MAIN` 시프트(DES-005), ② 포디움 애니메이션, ③ Footer의 SSR 영어→마운트 후 한국어 교체(`components/layouts/Footer.tsx:42`)다. 배너 영역은 `min-h-[180px]`와 `aspect-ratio: 700/356`로 공간을 확보해 두었다(유지할 것). 광고 앵커는 fixed라 CLS에는 잡히지 않지만 콘텐츠를 가린다.

### 스크린샷 파일

모두 `docs/audit-2026-09-26/screens/` 아래에 있다(Playwright, CSS 픽셀, 2026-09-26 01:15~01:22 KST).

| 파일 | 내용 |
|---|---|
| `home-redirect-en-vote-390.png` | `/` → `/en/vote`, 390×844 뷰포트(하단 광고 칩) |
| `home-redirect-en-vote-1440.png` | 같은 페이지, 1440×900 |
| `vote-list-ko-390-full.png` | `/ko/vote` 전체 페이지(375×3,870, 스크롤바 제외 폭) |
| `vote-list-ko-1440.png` | `/ko/vote`, 1440(우하단 광고 칩) |
| `vote-detail-ko-390.png` | `/ko/vote/295`, 390(실시간 연결 토스트, 날짜 줄바꿈) |
| `vote-detail-en-390.png` | `/en/vote/295`, 390(한국어 하드코딩 노출) |
| `vote-detail-ko-1440.png` | `/ko/vote/295`, 1440 |
| `mypage-guest-ko-390.png` | `/ko/mypage` 비로그인, 390(단어 중간 줄바꿈) |
| `mypage-guest-ko-1440.png` | `/ko/mypage` 비로그인, 1440(투표 섹션과 다른 크롬·파랑 히어로) |
| `login-ko-390.png` | `/ko/login`, 390 |
| `login-ko-1440.png` | `/ko/login`, 1440 |
| `notfound-ko-1440.png` | 루트 404, 1440(Tailwind 미로드, 장식 겹침) |

## 컴포넌트 중복 목록

사용처 수는 import 경로와 JSX 사용 grep으로 확인했다. barrel(`index.ts`) 재수출만 있는 경우는 미사용으로 봤다. 표의 줄 수는 스캔 스크립트 기준이라 `wc -l`과 1줄 차이가 날 수 있다(미사용 합계는 `wc -l` 기준). 정적 분석이므로 삭제 전 knip(structure.md STR-014)과 교차 확인이 필요하다.

| 계열 | 구현(파일 · 줄 수 · 사용처) | 상태·문제 | 기준 후보 |
|---|---|---|---|
| 버튼 | `components/common/atoms/Button.tsx` 80줄 · 3파일 / `components/client/RetryButton.tsx` 32줄 · 2 / `components/client/vote/common/VoteButton.tsx` 99줄 · 1 / `components/client/concert2025/BookingButtons.tsx` 50줄 · 1 / raw `<button>` **117개 · 64파일** | 공통 Button 채택 3/64. `RetryButton`은 `bg-primary-500`(=파랑 #3b82f6) | `atoms/Button`에 variant(primary/secondary/ghost/danger)와 size 추가 |
| 입력 | `components/common/atoms/Input.tsx` 60줄 · **0** / raw `<input>` 12 | atom 미사용. 라벨 연결 규약 없음 | `atoms/Input` + label/aria 필수화 |
| 스피너·로딩 | `common/atoms/Spinner.tsx` 44줄 · 1 / `ui/LoadingSpinner.tsx` 35줄 · 1 / `client/common/LoadingSpinner.tsx` 33줄 · **0**(barrel만) / `server/LoadingState.tsx` 84줄 · 6 / `ui/GlobalLoadingOverlay.tsx` 49줄 · 3 / `client/auth/login/LoadingIndicator.tsx` 19줄 · 1 / `server/auth/CallbackLoading.tsx` 56줄 · 1 / `ui/PulseOverlay.tsx` 40줄 · **0** / 인라인 `animate-spin` **18파일** | 스피너 컴포넌트 3종 + 인라인 18종. 이름 `LoadingSpinner` 중복 | `atoms/Spinner` 하나로 |
| 스켈레톤 | `server/VoteDetailSkeleton` 60줄 · 3 / `server/vote/VoteListSkeleton` 156줄 · 2 / `client/vote/list/VoteLoadingSkeleton` 25줄 · 1 / `server/banner/BannerSkeleton` 34줄 · 1 / `client/media/MediaSkeleton` 34줄 · 1 / `client/reward/RewardDetailSkeleton` 91줄 · 1 / `client/reward/RewardListSkeleton` 28줄 · 1 / `client/star-candy/StarCandySkeleton` 136줄 · 1 / `server/mypage/{MyPage 82, FAQ 23, Notice 55, NoticeDetail 25, Qna 43, RechargeHistory 132, VoteHistory 123}Skeleton` 각 1~2 / `server/AuthCallbackSkeleton` 63줄 · **0** / `ui/animations/AnimatedVoteComponents.VoteSkeleton` / `animate-pulse` 171회 · 38파일 | 17종 이상이 각자 색·radius·애니메이션을 정의. `VoteListSkeleton`은 `animate-shimmer` 오작동(DES-021) | `Skeleton.Box/Text/Avatar` 프리미티브 + 화면별 조합 |
| 다이얼로그·모달 | 공통: `ui/Dialog/Dialog.tsx` 341줄(Headless UI, `role=dialog`) + Alert 47 / Confirm 95 / Action 97 / LoginRequired 185 / WithdrawnUser 103(모두 `DialogProvider` 경유, 사용처 4) / 직접 구현: `client/vote/dialogs/VoteDialog.tsx` 240줄 · 1, `client/vote/dialogs/PopupBanner.tsx` 179줄 · 1, `client/star-candy/StarCandyProductsPresenter.tsx:272` 내부 모달, `app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaMediaModal.tsx` 78줄 · 1, `client/PosterGrid.tsx:52` 라이트박스, `client/vote/dialogs/LoginDialog.tsx` 66줄 · **0**(LoginRequiredDialog와 기능 중복) / `anti-abuse/RateLimitedDialog.tsx` 93줄(공통 Dialog 사용 ✓) | 직접 구현 6곳 중 role/aria-modal 0곳, Esc 처리 2곳(`QnaMediaModal`, `PosterGrid`), 포커스 트랩 0곳 | `ui/Dialog` 하나로 통합 |
| 카드 | `common/molecules/Card.tsx` 72줄 · 1 / `client/vote/list/VoteCard.tsx` 295줄 · 1 / `client/vote/list/VoteItem.tsx` 213줄 · **0** / `client/vote/common/VoteRankCard.tsx` 232줄 · 2 + `VoteRankCardAnimated.tsx` 263줄 · 1 / `common/RewardItem.tsx` 55줄 · 2 | 공통 Card 채택 1곳. 카드 스타일(radius·그림자·테두리) 제각각 | `molecules/Card` + 슬롯 |
| 포디움(TOP3) | `OngoingVoteItems.tsx` 인라인 포디움 / `client/vote/detail/VotePodium.tsx` / `client/vote/common/RankingView.tsx` 320줄 · **0** | 같은 개념 3구현(1개 미사용). 목록·상세 득표율 기준 불일치(DES-012) | `VotePodium` + `totalVotes` 주입 |
| 오류 표시 | `app/[lang]/error.tsx`(인라인 style 15, hex 27) / `app/[lang]/(main)/vote/[id]/error.tsx`(영어 하드코딩) / `app/[lang]/(main)/media/error.tsx` / `app/global-error.tsx` / `client/vote/common/VoteErrorFallback.tsx` 25줄 · 1(한국어 하드코딩) / `mypage/MypageStates.tsx`의 `ErrorState` · 2 / `server/ErrorState.tsx` 45줄(미사용 컴포넌트에서만 사용) / `common/DefaultErrorFallback.tsx` 104줄(미사용 ErrorBoundary에서만 사용) / `common/ErrorBoundary.tsx` 275줄 · **0** / `server/ErrorBoundary.tsx` 86줄 · **0** / `server/AsyncBoundary.tsx` 73줄 · **0** / `common/GlobalErrorDisplay.tsx` 255줄 · **0** | 활성 4종이 언어·톤·CTA 모두 다름(DES-013). `ErrorState` 이름 중복 | 공통 `ErrorState`(t() + reset + 홈 링크) |
| 404·빈 상태 | `app/not-found.tsx`(인라인) / `app/[lang]/not-found.tsx`(인라인 style 11, hex 20) / `server/NotFoundState.tsx` 64줄 · **0** / `client/vote/list/VoteEmptyState.tsx` 44줄 · **0** / `MypageStates.EmptyState` · 2 / 인라인: `VoteListPresenter.tsx:218` `t('text_vote_no_items')`, `VoteDetailPresenter.tsx:175` "검색 결과가 없습니다.", `BannerCarouselClient.tsx:42` "현재 표시할 배너가 없습니다." | 빈 상태 컴포넌트가 있는데 쓰이지 않고, 인라인 문구 3곳 중 2곳은 하드코딩 | `EmptyState` 하나로 |
| 페이지네이션 | `common/molecules/Pagination.tsx` 99줄 · 2 / `client/vote/list/VotePagination.tsx` 57줄 · **0** / `GridView.tsx:229-258` 내장 prev/next(아이콘 버튼 무라벨) | 3구현 | `molecules/Pagination` |
| 타이머 | `client/vote/common/CountdownTimer.tsx` 211줄 · 1 / `client/vote/common/VoteTimer.tsx` 48줄 · 1 / `VoteDetailPresenter.tsx:32-55` 인라인 `renderTimer`(한국어 단위 하드코딩) | 3구현, 단위 표기 규칙이 제각각 | `CountdownTimer`(단위·aria 포함) |
| 상태 배지 | `client/vote/VoteStatus.tsx` 32줄 · **0** / `server/vote/VoteStatus.tsx` 30줄 · **0** / `common/atoms/Badge.tsx` 46줄(위 두 파일에서만 사용) / 카드·상세의 인라인 배지 | 공통 Badge가 실사용 0 | `atoms/Badge` |
| 이미지·아바타 | `ui/OptimizedImage.tsx` 327줄 · 18 / `ui/SafeAvatar.tsx` 333줄 · **0** / `ui/ProfileImageContainer.tsx` 108줄 · 3 / `layouts/ProfileImageContainer.tsx` 30줄 · **0**(같은 이름) | 아바타 2종 중복, 1종 미사용 | `OptimizedImage` + `ui/ProfileImageContainer` |
| 레이아웃 | `components/layouts/MainLayoutClient.tsx` 131줄((main) 그룹: BETA 배너·서브 내비·Provider 재래핑) / `app/[lang]/(main)/MainLayoutClient.tsx` 90줄((mypage) 그룹: 배너·내비 없음) / `app/[lang]/ClientLayout.tsx` 83줄 / `app/[lang]/ClientLayout-minimal.tsx` 23줄 · **0** / `app/[lang]/VoteLiteClientLayout.tsx` 77줄(`x-pathname` 부재로 사실상 미사용, DES-002) / Footer: `components/layouts/Footer.tsx` 74줄 · 2 vs `app/[lang]/Footer.tsx` 47줄 · **0** / 서브 내비: `MainLayoutClient.tsx:57-75` vs `client/common/PicnicMenu.tsx` 127줄 | 섹션별 크롬 불일치(DES-011). 같은 이름 파일 3쌍 | 단일 `SiteShell` + 슬롯 |
| 투표 목록 변형 | `client/vote/list/VoteList.tsx` 339줄 · **0**(role=button div, tabIndex 없음) / `VoteListCSR.tsx` 120줄 · 1 / `VoteListPresenter` / `VoteItems`·`Ongoing`·`Upcoming`·`CompletedVoteItems` / `VoteResults.tsx` 253줄 · **0** / `VoteSubmit.tsx` 283줄 · **0** / `VoteFilterSection.tsx` 66줄(`VoteFilterSectionDeferred` 경유 1) | 미사용 3개 파일 875줄 | 현행 Presenter 계열 |
| 데모·예제·디버그 | `client/vote/common/GridViewDemo.tsx` 166 / `server/VoteDataExample.tsx` 73 / `server/NestedDataFetching.tsx` 188 / `server/ParallelDataFetching.tsx` 159 / `debug/EnvChecker.tsx` 56 / `common/VirtualScrollList.tsx` 227 — 모두 **0** | 프로덕션 트리에 남은 예제 | 삭제 또는 `docs/`로 이동 |
| 스타일 소스 | `app/[lang]/globals.css` 47줄(유일하게 import) / `styles/globals.css` 95줄(**import 0**) / `components/ui/Dialog/theme.ts`(자체 테마: 임의값 21, 팔레트 65) / `Header.tsx:274-282` styled-jsx(스코프) | 전역 스타일 정의가 3곳에 흩어짐(DES-021) | `app/[lang]/globals.css` `@layer` + `tailwind.config.js` |

**미사용 합계(정적 스캔)**: 32개 파일 4,057줄. 목록은 VoteList, VoteResults, VoteSubmit, RankingView, AuthCallbackSkeleton, VoteItem, VoteEmptyState, VotePagination, LoginDialog, PulseOverlay, GlobalErrorDisplay, NotFoundState, SafeAvatar, VirtualScrollList, GridViewDemo, VoteDataExample, NestedDataFetching, ParallelDataFetching, EnvChecker, ClientLayout-minimal, `app/[lang]/Footer`, `layouts/ProfileImageContainer`, `client/common/LoadingSpinner`, `atoms/Input`, `common/ErrorBoundary`, `server/ErrorBoundary`, AsyncBoundary, VoteStatus(client), VoteStatus(server), DefaultErrorFallback, `server/ErrorState`, `atoms/Badge`다.

## 발견사항

형식: 근거(파일:라인·실측) / 영향 / 최소 수정 방향 / 작업량(S≤반나절, M≤3일, L>3일) / 회귀 위험.

### P1 — 높음

#### DES-001 [P1] 투표 상세 등 대부분 페이지의 canonical이 홈이고 title·OG가 `피크닠` 하나로 고정됨

- **근거**: `app/[lang]/layout.tsx:42` `canonical: lang === 'ko' ? '/' : \`/${lang}\``가 모든 하위 페이지의 기본값이다. `app/[lang]/(main)/vote/[id]/page.tsx`에는 `generateMetadata`가 없다(전체 파일 30줄). media·login·mypage·faq·notice도 metadata를 내보내지 않는다(`grep generateMetadata`). 프로덕션 curl 결과, `/ko/vote/295`는 `<link rel="canonical" href="https://www.picnic.fan"/>`, `og:title=피크닠`이고 og:url은 없다. `/ko/media`, `/ko/login`, `/ko/mypage`, `/ko/faq`, `/ko/notice`, `/ko/star-candy`도 canonical이 `https://www.picnic.fan`(en은 `/en`)이다.
- **영향**: `sitemap.xml`이 투표 상세 **2,916개**(투표 243개 × 12개 언어)를 색인 대상으로 제출하는데, 각 페이지는 "원본은 홈"이라고 선언한다. 게다가 홈 URL은 307 두 번(`/` → `/en` → `/en/vote`)을 거친다. 검색엔진이 상세 페이지를 중복으로 보고 색인에서 빼거나 canonical을 무시할 수 있다(추정, Search Console로 확인 필요). SNS 공유 미리보기도 투표 제목·이미지 없이 "피크닠" 기본 카드로 나온다.
- **최소 수정**: ① 레이아웃의 canonical 기본값을 제거하거나 현재 경로로 만든다. ② `vote/[id]/page.tsx`에 `generateMetadata`를 추가한다. 투표 제목·대표 이미지·`/${lang}/vote/${id}` canonical·언어별 alternates를 넣고, `VoteDetailFetcher`와 조회를 `React.cache`로 공유한다. ③ 나머지 페이지는 `createPageMetadata`와 경로별 canonical을 쓴다.
- **작업량**: M · **회귀 위험**: 낮음(메타데이터만 변경). 상세 조회가 한 번 더 일어나지 않도록 캐시 공유를 확인해야 한다.

#### DES-002 [P1] `<html lang>`이 모든 로케일에서 `ko` — 레이아웃이 읽는 `x-pathname` 헤더를 아무도 만들지 않음

- **근거**: `app/layout.tsx:42-57`, `app/layout.tsx:69`는 `x-pathname`·`x-url` 헤더로 언어를 판별하고, 없으면 `'ko'`를 쓴다. `grep` 결과 이 헤더는 읽기만 3곳(`app/layout.tsx:42`, `app/[lang]/layout.tsx:77`, `components/server/banner/BannerListFetcher.tsx:58`) 있고 설정하는 곳은 없다. `middleware.ts:84`는 원본 헤더만 전달한다. 실측 결과 `/en/vote`, `/en/vote/295`, `/ja/vote`가 모두 `<html lang="ko">`다. 같은 원인으로 `/ko/vote`와 `/ko/download`의 AdSense props가 둘 다 `delayUntilIdle:false, idleTimeout:1200`이다. 즉 vote 라우트 5초 지연(PICNIC-WEB-5C 대응, `app/layout.tsx:66`)과 `/download` 광고 제외(`app/layout.tsx:64`)가 작동하지 않고, `VoteLiteClientLayout`(`app/[lang]/layout.tsx:79-85`)도 한 번도 쓰이지 않는다. 원인 분석은 structure.md STR-003과 같다.
- **영향**: 11개 비한국어 로케일에서 스크린리더가 한국어 음성으로 읽는다(WCAG 3.1.1 위반). 브라우저 번역 제안, 하이픈 처리, 폰트 선택이 틀어진다. ja·zh 페이지의 한자가 한국어 글리프 우선으로 렌더링될 수 있다(일반적 브라우저 동작 기반 추정, 실측 안 함). `/download` 랜딩에도 광고가 로드된다.
- **최소 수정**: 단계적으로 고친다. 먼저 middleware에서 **언어 전용 헤더**(예: `x-locale`)를 request header로 주입하고 `app/layout.tsx`의 lang 판별만 그 헤더로 바꾼다. `x-pathname` 주입은 VoteLite 레이아웃과 광고 지연 분기를 동시에 켜므로 별도 PR로 검증한 뒤 켠다.
- **작업량**: S(lang만) / M(x-pathname 전체) · **회귀 위험**: lang만 바꾸면 낮음. x-pathname을 켜면 **높음**이다. 프로덕션에서 한 번도 실행되지 않은 `VoteLiteClientLayout` 경로가 활성화되고 광고 타이밍이 바뀐다.

#### DES-003 [P1] 핵심 투표 경로(후보 카드 → 투표 다이얼로그)가 키보드·스크린리더로 조작 불가

- **근거**: 후보 카드가 `components/client/vote/detail/VoteDetailPresenter.tsx:101`의 `<div … onClick={() => { if (canVote) handleCardClick(item) }}>`다. role, tabIndex, 키 핸들러가 없다. 실측에서 `/ko/vote/295`의 클릭 가능한 비시맨틱 요소가 115개였다. `components/client/vote/dialogs/VoteDialog.tsx:53-66`의 오버레이·패널에는 `role="dialog"`, `aria-modal`, Esc 처리, 포커스 이동·트랩이 모두 없다. 수량 입력(`VoteDialog.tsx:115-130`)은 라벨 없이 `placeholder="1"`만 있다. 증감 버튼(`VoteDialog.tsx:133-146`)은 글리프 "▲"/"▼"만 있고, 닫기(`VoteDialog.tsx:80`)는 아이콘 전용 무라벨이다. 검색 input(`VoteSearch.tsx`)도 라벨이 없다. 같은 패턴이 jsx-a11y strict에서 click-events-have-key-events 15건과 no-static-element-interactions 14건(11개 파일)으로 잡힌다: `VoteRankCard.tsx:137`, `OngoingVoteItems.tsx:203`·`211`, `RewardImageGallery.tsx:101`, `PosterGrid.tsx:51`, `NotificationsClient.tsx:263`, `QnaMediaModal.tsx:38`·`55`·`59`, `VoteClientComponent.tsx:68` 등.
- **영향**: 키보드만 쓰는 사용자는 후보 카드에 포커스할 수 없어 투표를 시작할 수 없다. 다이얼로그가 열려도 포커스가 뒤 페이지에 남는다. 스크린리더는 대화상자임을 알리지 않고, 증감 버튼을 "검은 위쪽 삼각형"으로 읽는다.
- **최소 수정**: 카드를 `<button type="button">`으로 바꾸거나(스타일 유지), `role="button" tabIndex={0}`과 Enter·Space 처리를 넣는다. `VoteDialog` 본문을 기존 `components/ui/Dialog/Dialog.tsx`(Headless UI: 포커스 트랩·Esc·aria 제공)로 감싼다. 증감 버튼에는 `aria-label`(t 키), 수량 input에는 `<label>`이나 `aria-labelledby`(h3), 검색 input에는 `aria-label`을 붙인다.
- **작업량**: M · **회귀 위험**: 중간. 카드 hover·transform 스타일과 framer-motion 진입 애니메이션을 Headless UI Transition과 조정해야 한다. 투표 제출 로직은 건드리지 않는다.

#### DES-004 [P1] 비한국어 투표 상세·토스트·오류에 한국어 하드코딩 노출

- **근거**: `components/client/vote/detail/VoteDetailPresenter.tsx`에 하드코딩 문자열이 모여 있다. `:40` "마감", `:48-53` "{d}일/{h}시/{m}분/{s}초", `:70` "진행 중/예정/종료", `:77` "👥 총 N 표", `:88` "`${n}명 중 검색...`", `:98` "아티스트", `:158` "{rank}위", `:175` "검색 결과가 없습니다.", `:188` "🎁 투표 리워드", `:192` "리워드 #n"이다. 그 밖에 `components/client/vote/detail/useVotePolling.ts:179-180` 토스트 "실시간 연결 성공 / 투표 결과가 실시간으로 업데이트됩니다.", `components/client/vote/detail/useVoteDetail.ts:223` `toLocaleDateString('ko-KR', …)`, `components/server/utils.ts:128`의 `'ko-KR'` 기간 포맷, `components/client/vote/common/VoteErrorFallback.tsx:13`·`:21`("다시 시도"), `components/client/vote/list/VoteSubmit.tsx`(미사용)가 있다. 스캔 상한은 88개 파일 364줄이다. 실측 `screens/vote-detail-en-390.png`에서 한국어 5종이 보인다.
- **영향**: 12개 언어 중 11개 언어 사용자가 서비스 핵심 화면에서 한국어를 본다. 날짜가 "2026년 9월 12일 오후 06:00" 형식으로 고정된다.
- **최소 수정**: 문자열을 `t()` 키로 옮기고, `ko.json`·`en.json`을 기준으로 나머지 언어는 기존 `i18n:auto` 흐름으로 채운다. 날짜는 `Intl.DateTimeFormat(currentLocale, { timeZone: 'Asia/Seoul', … })`로 만들고 "KST" 표기를 덧붙인다. TZ 고정은 유지한다.
- **작업량**: M · **회귀 위험**: 낮음. 문자열 길이 차이로 배지·버튼 폭이 달라지므로 ja·en 화면을 확인해야 한다.

### P2 — 중간

#### DES-005 [P2] 클라이언트 번역이 SSR·하이드레이션 직후 빈 문자열 → 라벨 팝인, SSR 언어 뒤바뀜

- **근거**: `stores/languageStore.ts:170-176`는 하이드레이션 전이나 로드 중에 `''`를 반환한다. `stores/languageStore.ts:63-87`은 `/locales/{lang}.json`을 **클라이언트에서 fetch**한다. `utils/api/strings.ts:47-48`의 `getLocalizedString`은 서버에서 무조건 `'en'`을 쓴다. `components/layouts/Footer.tsx:42`는 SSR에서 항상 영어를 렌더링한 뒤 마운트 후 ko로 바꾼다. 서버용 사전 로더(`lib/i18n/server.ts`)는 있지만 notice·faq·download·concert2025·history 5~6개 페이지만 쓴다. 실측: `/ko/vote` SSR HTML에 "In Progress" 7회, 탭 라벨 0회.
- **영향**: 첫 페인트에서 탭·버튼·배지 라벨이 비었다가 채워지고, 한국어 사용자에게는 영어에서 한국어로 바뀌어 보인다. 크롤러는 라벨 없는 HTML을 본다. CLS의 주 시프트(`MAIN`, 0.034@851ms, 390px)가 여기서 온다고 본다(추정).
- **최소 수정**: `app/[lang]/layout.tsx`에서 `getTranslations`로 읽은 사전을 `LanguageSyncProvider` 초기 상태로 주입한다(store를 동기 hydrate). `getLocalizedString`에 `params.lang`을 명시적으로 넘긴다. Footer의 mounted 분기를 없앤다.
- **작업량**: M~L · **회귀 위험**: 중간. 서버·클라이언트 사전이 다르면 hydration mismatch가 난다. 사전 크기만큼 RSC payload가 커지므로 필요 키만 넘기는 방안도 검토한다.

#### DES-006 [P2] 번역 키 누락 — 결제 12키가 6개 언어에 없고, 탈퇴 안내 2키는 12개 언어 모두에 없음

- **근거**: `npm run i18n:check`(exit 1). bn·id·my·th·tl·vi에 `bonus_star_candy_label, currency_krw, current_balance_label, payment_amount_label, payment_completed_description, payment_completed_title, product_name_label, recharge_details, recharge_result, recharge_star_candy_label, total_recharge_star_candy_label, unit_count`가 없다. 전 언어에 `error_message_withdrawal_title/description`이 없다(`components/ui/Dialog/WithdrawnUserDialog.tsx:28`·`37`). 클라이언트 폴백은 기본 언어 사전이 **이미 로드된 경우에만** 동작하고, 아니면 프로덕션에서 `''`를 반환한다(`stores/languageStore.ts:181-208`). 미사용 키는 언어당 613개로 전체의 64%다.
- **영향**: 인도네시아어·태국어·베트남어 등 6개 언어 사용자는 결제 완료·충전 내역 화면 라벨이 공백으로 보인다(`recharge-history` 등). 탈퇴 다이얼로그는 제목과 본문이 같은 폴백 문구(`error_message_withdrawal`)로 중복 표시된다.
- **최소 수정**: 누락 키 14개를 추가한다(번역 파일 편집). 폴백용으로 `en` 사전을 항상 함께 로드한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-007 [P2] 디자인 토큰 붕괴 — `primary` DEFAULT는 보라, 50~950은 Tailwind 기본 파랑

- **근거**: `tailwind.config.js:117-130`에서 `primary.DEFAULT: '#9374FF'`인데 `50: '#eff6ff'` … `500: '#3b82f6'` … `950: '#172554'`다(Tailwind blue 그대로). 사용 예: `components/client/RetryButton.tsx:27` `bg-primary-500 hover:bg-primary-600`(=파랑), `components/server/mypage/MyPageAccountMenu.tsx:31-33` `from-primary-50 to-primary-100`·`from-primary-500 to-primary-600`(=파랑 그라데이션), `components/client/vote/dialogs/VoteDialog.tsx:76` `from-primary to-secondary`(보라→민트). 통계: `primary-<단계>` 122회/30파일, `bg-primary` 73회, 기본 팔레트 1,679회 대 브랜드 토큰 496회, 팔레트 계열 15개, hex 56종, 임의값 160회, radius 7단계, 다이얼로그 자체 테마 `components/ui/Dialog/theme.ts`(임의값 21). 간격·타이포 토큰: `tailwind.config.js`에 spacing·fontFamily·fontSize 확장이 없어 기본 스케일만 있다. 임의 간격·크기 값은 99회/31파일이다(`Dialog/theme.ts` 21, 미사용 `RankingView.tsx` 13, `Dialog.tsx` 8, `VoteDetailSkeleton.tsx` 7). 모달 최대 높이도 `max-h-[90vh]` 7회, `max-h-[85vh]` 6회로 갈린다. 기타: `msapplication-TileColor #4F46E5`(`app/[lang]/layout.tsx:50`), mask-icon `#5bbad5`(`metadata-utils.ts:74`).
- **영향**: 같은 "primary" 이름이 두 색으로 렌더링된다. 스크린샷에서 투표 섹션(보라 탭·칩)과 마이페이지(파랑 히어로), 상세 제목(파랑→보라 그라데이션)이 서로 다른 브랜드처럼 보인다. 색을 바꾸려면 30개 이상 파일을 수동으로 고쳐야 한다.
- **최소 수정**: ① `primary` 50~950을 #9374FF 기준 스케일로 재생성한다(예: 600 ≈ #7152F5, 700 ≈ #5B3FE0). 파랑이 의도였던 곳은 `blue-*`로 명시한다. ② 시맨틱 토큰(`brand`, `surface`, `text-muted`, `status-*`)을 추가하고 새 코드는 시맨틱 토큰만 쓴다. ③ `Dialog/theme.ts`를 토큰으로 대체한다.
- **작업량**: M(스케일·시맨틱 토큰) / L(전면 치환) · **회귀 위험**: 중간. 30개 파일의 색이 바뀌므로 화면별 시각 검수가 필요하다.

#### DES-008 [P2] 브랜드·보조 텍스트 대비 WCAG AA 미달

- **근거**(계산값, 흰 배경 기준):
  - 흰 글씨 on #9374FF 3.40:1: 활성 탭 `components/layouts/MainLayoutClient.tsx:70` `text-white bg-primary`, 칩 "ALL"(12~14px)
  - 흰 글씨 on orange-500 2.80:1: `components/layouts/Header.tsx:150` "Beta" 10px, `components/layouts/ExclusiveOpenBadge.tsx:47` 배너 12px
  - `text-primary`(25회) 3.40:1
  - `text-gray-400`(28회/21파일) 2.54:1: 버전 표기, 구분자
  - 흰 글씨 on secondary/sub/point: 1.27/1.20/1.80:1(사용 시)
  - 실측 저대비 요소: `/en/vote` 390px 5개, `/ko/mypage` 3개
- **영향**: 저시력 사용자와 야외 모바일 환경에서 핵심 내비·상태 배지를 읽기 어렵다. 일반 텍스트 AA 기준은 4.5:1이다.
- **최소 수정**: 텍스트·배경용 브랜드 색을 #7152F5(흰 글씨 4.97:1) 또는 #6A4DF4(5.28:1)로 분리한다. BETA 배너는 orange-700 #C2410C(5.18:1)로 바꾼다. 보조 텍스트는 gray-500 이상(4.83:1)을 쓴다. #9374FF는 장식과 대형 요소에만 쓴다.
- **작업량**: S(DES-007 스케일과 함께 하면 추가 비용 거의 없음) · **회귀 위험**: 낮음(시각만 변경).

#### DES-009 [P2] 모달 6곳이 직접 구현 — 접근성 수준이 제각각

- **근거**: 공통 `components/ui/Dialog/Dialog.tsx`(Headless UI, `role=dialog`)가 있는데도 `fixed inset-0` 오버레이를 직접 만든 곳이 있다: `VoteDialog.tsx:55`, `PopupBanner.tsx:62`, `StarCandyProductsPresenter.tsx:272`, `QnaMediaModal.tsx:39`·`56`, `PosterGrid.tsx:52`, 미사용 `LoginDialog.tsx:15`. 이 중 role·aria-modal은 0곳, Esc 처리는 2곳(QnaMediaModal, PosterGrid), 포커스 관리는 0곳이다. body 스크롤 잠금 방식도 각자 다르다.
- **영향**: 모달마다 닫는 법, 포커스, 배경 스크롤 동작이 달라 일관성이 없고 키보드 사용자가 갇히거나 길을 잃는다. 결제(StarCandy) 모달도 포함된다.
- **최소 수정**: 공통 Dialog에 `size`·`fullscreen`(라이트박스) variant를 추가하고 6곳을 이관한다. 미사용 LoginDialog는 삭제한다(LoginRequiredDialog가 대체).
- **작업량**: M · **회귀 위험**: 중간. 결제 모달은 결제 흐름 회귀 테스트가 필요하다(상태 변경 없는 UI 레벨 테스트 권장).

#### DES-010 [P2] 공통 컴포넌트 채택률 저조 + 미사용 UI 32개 파일(4,057줄)

- **근거**: 위 "컴포넌트 중복 목록" 참조. Button은 3/64파일, Input·Badge는 실사용 0, Card는 1. 스켈레톤 17종 이상, 스피너 3종 + 인라인 18곳, 오류 표시 활성 4종, 같은 이름 파일 3쌍(Footer, MainLayoutClient, ProfileImageContainer).
- **영향**: 디자인 수정(색·radius·포커스 스타일)을 한 곳에서 할 수 없다. 죽은 코드가 grep과 리뷰를 오염시킨다. 실제로 `app/[lang]/Footer.tsx`와 `components/layouts/Footer.tsx`처럼 어떤 쪽이 쓰이는지 헷갈린다.
- **최소 수정**: ① 미사용 32개 파일을 knip과 교차 확인한 뒤 PR 2~3개로 나눠 삭제한다. ② atom(Button·Input·Badge·Spinner·Skeleton·Card) API를 확정하고, 새 코드는 atom만 쓰도록 lint 규칙(`no-restricted-syntax`로 raw `<button className=…>` 경고)을 추가한다.
- **작업량**: M(삭제·규칙) / L(점진 치환) · **회귀 위험**: 삭제는 낮음(barrel 재수출 정리 필요). 치환은 중간.

#### DES-011 [P2] 섹션별 레이아웃 크롬 불일치 — 투표와 마이페이지

- **근거**: `app/[lang]/(main)/layout.tsx:2`는 `components/layouts/MainLayoutClient`(BETA 배너, 서브 내비 `:57-75`, 전폭 헤더, `<main>` `:104`)를 쓰고, `app/[lang]/(mypage)/layout.tsx:5`는 `app/[lang]/(main)/MainLayoutClient`(컨테이너 안 헤더, 배너·서브 내비 없음, `PicnicMenu`)를 쓴다. 실측 1440px에서 로고 x 89px → 105px, 헤더 하단선 전폭 → 컨테이너 폭. (main) 레이아웃은 Provider 스택도 다시 감싼다(structure.md STR-002).
- **영향**: 투표 → 마이페이지 이동 시 헤더가 좌우로 튀고, 서브 내비(투표·리워드·미디어·별사탕 충전)가 사라져 섹션 간 이동 경로를 잃는다.
- **최소 수정**: 레이아웃 셸을 하나로 합치고 배너·서브 내비 표시 여부만 prop이나 slot으로 제어한다.
- **작업량**: M · **회귀 위험**: 중간. Provider 중복을 함께 정리할 때 Auth·Dialog 컨텍스트 참조를 확인해야 한다.

#### DES-012 [P2] 같은 후보의 득표율이 목록과 상세에서 다름

- **근거**: `lib/data-fetching/server/vote-service.ts:50-59`가 진행중·완료 투표의 항목을 TOP3로 자르고, `components/client/vote/list/OngoingVoteItems.tsx:125`가 `totalVotes = sumVoteTotals(voteItems)`(= TOP3 합)을 분모로 쓴다. 상세는 전체 후보 합을 쓴다. 실측(투표 295): 하성운 목록 34.26% / 상세 28.83%, 정선혜 33.22% / 27.96%, 후이 32.53% / 27.38%.
- **영향**: 투표 결과 신뢰도에 직접 영향을 준다. 같은 화면 흐름에서 수치가 바뀐다.
- **최소 수정**: `vote-service`에서 slice 전에 전체 합계를 계산해 `totalVotes`로 함께 내려준다(현재 쿼리가 전체 항목을 가져오는 경우 DB 변경 불필요). 쿼리가 이미 제한된다면 투표 단위 합계 컬럼·RPC가 필요하므로 **picnic-supabase 이관 필요**. 임시로는 목록 라벨을 "TOP3 내 비중"으로 명시한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-013 [P2] 오류 상태 UX 비일관 — 언어 혼재, 원시 에러 노출, 잘못된 CTA

- **근거**:
  - `components/client/vote/common/VoteErrorFallback.tsx:13`: 한국어 하드코딩. `:18`에서 `error.message`를 `<pre>`로 그대로 노출.
  - `app/[lang]/(main)/vote/[id]/error.tsx:28-43`: 영어 하드코딩("Something went wrong while fetching vote data!"). `error.message`를 노출하고, `RetryButton`(`components/client/RetryButton.tsx:21`)은 `/login`으로 보낸다(`t('return_to_login')`).
  - `app/[lang]/error.tsx`: 인라인 style 15, hex 27로 디자인 시스템 밖에 있다.
  - 상세 페이지는 `error.tsx`와 `react-error-boundary`(`vote/[id]/page.tsx:23`)가 이중으로 감싼다.
- **영향**: 데이터 오류를 만난 사용자에게 개발자용 메시지와 무관한 "로그인으로" 버튼을 보여 준다. 언어가 한국어·영어로 섞인다.
- **최소 수정**: 공통 `ErrorState`(t() 문구, `reset()` 재시도, 홈 링크, 오류 ID만 노출)를 만들고 3곳에 적용한다. 원문 메시지는 Sentry로만 보낸다.
- **작업량**: S~M · **회귀 위험**: 낮음.

#### DES-014 [P2] 광고 앵커(AdSense 자동 광고 추정)가 투표 카드·결과를 가리고 로그인 화면에도 로드됨

- **근거**: `screens/home-redirect-en-vote-390.png` 하단 칩("음악 자료실")이 득표율 줄을 가린다. `screens/vote-list-ko-1440.png` 우하단 칩("온라인 이미지 갤러리")이 3번째 카드의 순위·이름을 가린다. `/ko/login` DOM에 `svg[aria-label="쇼핑 앵커 닫기"]`가 있고, 콘솔에 `cksync.yahoo.co.jp` 400이 3건 찍힌다. 페이지에 `pagead2…/reactive_lib`, `fundingchoicesmessages` 스크립트가 로드된다. 칩 자체는 메인 DOM에서 찾을 수 없어(iframe·shadow) **AdSense 앵커·인텐트 형식으로 추정**한다. 로드 조건은 `app/layout.tsx:64-67`(DES-002 때문에 경로 예외가 무력화됨)이다.
- **영향**: 투표 결과와 하단 CTA가 가려진다. 인증 화면에서 광고 네트워크 요청이 나간다. 영어 페이지에 한국어 광고 칩이 뜬다(지역 기반).
- **최소 수정**: AdSense 콘솔에서 앵커·인텐트 형식을 끄거나 URL 제외(로그인, `/auth/*`, 투표 상세)를 설정한다. 코드에서는 `/login`·`/auth` 경로를 `isAdFreeRoute`에 추가한다(DES-002 수정 후 동작).
- **작업량**: S · **회귀 위험**: 낮음(기술). 광고 수익 영향은 **오너 결정 사항**이다.

#### DES-015 [P2] 브랜드 표기·title 템플릿 혼란 — `피크닠`/`피크닉`/`Picnic`, 이중 브랜드, 영어 페이지의 한국어 title

- **근거**: 템플릿 `'%s | 피크닠'`(`app/[lang]/utils/metadata-utils.ts:14-17`). 실측 title:
  - `/ko/star-candy` "별사탕 충전 | 피크닉 | 피크닠"
  - `/en/star-candy` "Star Candy Recharge | Picnic | 피크닠"
  - `/ko/rewards` "리워드 - 피크닠 | 피크닠"
  - `/en/vote` "투표 | 피크닠"(`vote/page.tsx:28-31` 한국어 고정)
  - 404 "Picnic"
  - 표기 빈도: 코드 `피크닠` 26 / `피크닉` 4, `ko.json` `피크닠` 5 / `피크닉` 7
- **영향**: 검색 결과와 브라우저 탭에서 브랜드가 흔들리고, 비한국어 사용자에게 한국어 title이 노출된다.
- **최소 수정**: 공식 표기를 결정한다(오너 결정). 언어별 템플릿(`%s | Picnic` / `%s | 피크닉` 등)을 쓰고, 페이지 title에서는 브랜드를 뺀다. vote title·description은 `getTranslations(lang)`으로 만든다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-016 [P2] hreflang이 12개 언어 중 2개뿐이고, ko-KR 대체 URL이 영어로 리다이렉트됨

- **근거**: `metadata-utils.ts:33-37`의 `languages: { 'ko-KR': '/', 'en-US': '/en' }`, `createDynamicPathMetadata`(`:220-221`), `vote/page.tsx:33-37`, `rewards/page.tsx:35-38`이 모두 ko·en만 선언한다. 실측: `/` → 307 `/en` → 307 `/en/vote`. 즉 "한국어 대체" URL이 영어 페이지로 간다. `og:locale`은 ko_KR과 en_US만 있고(`app/[lang]/layout.tsx:46`, 페이지 metadata가 덮어쓰면 누락), og:url은 없다. sitemap은 12개 언어 × 268 URL인데 `xhtml:link` alternates가 0이다.
- **영향**: ja·zh·id 등 10개 언어 페이지가 서로를 대체본으로 연결하지 않는다. 검색엔진이 지역별로 올바른 언어 페이지를 고르기 어렵다.
- **최소 수정**: `SUPPORTED_LANGUAGES`로 `languages` 맵과 `x-default`를 생성한다. ko는 `/ko/...`로 둔다. og:locale 매핑표와 og:url을 추가한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-017 [P2] 랜드마크·헤딩 구조 결함 — 중첩 `main`, h1 부재, `nav`·skip link 없음

- **근거**: 레이아웃 `components/layouts/MainLayoutClient.tsx:104` `<main>` 안에서 페이지가 다시 `<main>`을 쓴다: `vote/page.tsx:112`, `star-candy/page.tsx:32`, `media/page.tsx:14`, `concert2025/page.tsx:77`, `rewards/[id]/page.tsx:95`, `privacy/page.tsx:68`, `terms/page.tsx:68`. 실측으로 투표 목록에 `main` 2개, h1 0, nav 0, skip link 0이고, 로그인은 h1 0, heading 0, main 0이다.
- **영향**: 스크린리더의 랜드마크·헤딩 탐색이 동작하지 않는다(WCAG 1.3.1, 2.4.1). 목록 페이지는 무엇에 관한 페이지인지 알리는 제목이 없다.
- **최소 수정**: 페이지 레벨 `<main>`을 `<div>`나 `<section>`으로 바꾼다. 투표 목록과 로그인에 h1을 넣는다(시각 숨김 가능). 서브 내비를 `<nav aria-label>`로 감싸고 "본문 바로가기" 링크를 추가한다.
- **작업량**: S · **회귀 위험**: 낮음. `main`에 걸린 CSS 선택자가 있는지 확인한다.

#### DES-018 [P2] 배너 링크의 접근성 이름이 비고, 링크가 `/ko`로 고정됨

- **근거**: `components/client/banner/BannerItem.tsx:25`(alt), `:60-61`(aria-label·title)이 모두 `getLocalizedString(banner.title)`이다. 데이터 제목이 비어 있으면 빈 값이 된다. 실측 `/en/vote`에서 링크 8개가 `aria-label="" title=""`이고 이미지 `alt=""`가 8개다. `banner.link`가 `https://www.picnic.fan/ko/vote/210` 같은 절대 URL로 저장돼 있다(데이터).
- **영향**: 스크린리더가 "링크"라고만 읽는다(WCAG 2.4.4, 4.1.2). 영어 등 비한국어 사용자가 배너를 누르면 한국어 페이지로 바뀐다.
- **최소 수정**: 제목이 비면 `t('banner_n', {n})` 같은 폴백을 쓰고, 빈 문자열 속성은 렌더링하지 않는다. 링크는 같은 도메인이면 host와 `/ko` 접두사를 제거하고 `getLocalizedPath`로 현재 로케일을 붙인다. 운영 데이터 정리는 선택이며 스키마 변경은 불필요하다.
- **작업량**: S · **회귀 위험**: 낮음.

### P3 — 낮음

#### DES-019 [P3] 터치 타깃과 10~11px 텍스트

- **근거**: 캐러셀 점 버튼 10×10px(`components/client/banner/BannerCarouselClient.tsx:149` `h-2.5 w-2.5`) 8개. 헤더 아이콘 버튼 모바일 32px(`components/layouts/Header.tsx:195`, `:199` `w-8 h-8`). 언어 버튼 40×32px(이름은 국기 이모지만). 약관 링크 높이 15~16px. `text-[10px]` 13회와 `text-[11px]` 11회(`OngoingVoteItems.tsx:305-314`, `CompletedVoteItems.tsx`, `VoteCard.tsx`, `StarCandyBalanceBox.tsx`, `Header.tsx:150`). 실측 `/en/vote` 390px에서 24px 미만 조작 요소 11개, 12px 미만 텍스트 69개.
- **영향**: WCAG 2.2 AA 2.5.8(24×24) 미달이 있고 모바일에서 오탭과 가독성 저하가 생긴다.
- **최소 수정**: 점 버튼은 시각 크기를 유지하고 패딩으로 히트 영역을 24px 이상 확보한다. 헤더 아이콘은 40~44px로 키운다. 최소 글자 크기는 12px(`text-xs`)로 둔다. 언어 버튼에 `aria-label="언어 선택: 한국어"`를 붙인다.
- **작업량**: S · **회귀 위험**: 낮음(카드 밀도 소폭 변화).

#### DES-020 [P3] 한국어 줄바꿈(`word-break: keep-all`) 미설정

- **근거**: 실측 computed `word-break: normal`. `screens/mypage-guest-ko-390.png`의 "환영합/니다!", "해제하세/요", `screens/vote-detail-ko-390.png`의 "26/일".
- **영향**: 제목과 CTA가 어색하게 끊겨 가독성과 완성도가 떨어진다.
- **최소 수정**: `html[lang="ko"] body { word-break: keep-all; overflow-wrap: anywhere; }`(DES-002 수정이 선행돼야 로케일별로 적용됨). 또는 제목 요소에 Tailwind `break-keep`을 붙인다.
- **작업량**: S · **회귀 위험**: 낮음(긴 URL·영문은 `overflow-wrap`으로 보호).

#### DES-021 [P3] 전역 CSS 이원화·스코프 오류로 죽은 클래스와 오작동 클래스

- **근거**:
  - `styles/globals.css`(95줄): import 0. 전역 CSS는 `app/[lang]/layout.tsx:2`의 `app/[lang]/globals.css`만 로드된다. 그래서 `image-container`(`components/ui/OptimizedImage.tsx:280`)가 무효다.
  - `animate-shimmer`: Tailwind 설정(`tailwind.config.js:45-48`, `:108`)의 translateX(-100%→100%)로 해석돼, `components/server/vote/VoteListSkeleton.tsx:37`·`:46-70`의 스켈레톤 블록 **자체가 좌우로 이동**한다(코드 근거, 화면 미확인).
  - `scrollbar-hide`: `Header.tsx:274-276`의 스코프 styled-jsx에만 정의돼, `MainLayoutClient.tsx:59`와 `PicnicMenu.tsx:81`에서는 무효다. 390px 스크린샷에서 서브 내비 아래에 스크롤바가 보인다.
  - `prose` 계열: `privacy/page.tsx:68`, `terms/page.tsx:68`에서 typography 플러그인 없이 무효(ReactMarkdown 컴포넌트 클래스로 실제 스타일은 적용됨).
- **영향**: 의도한 시각 효과가 조용히 빠지거나 반대로 동작한다. 스타일 출처를 추적하기 어렵다.
- **최소 수정**: `styles/globals.css`를 삭제하거나 필요한 규칙만 `app/[lang]/globals.css`의 `@layer utilities`로 옮긴다. shimmer는 background-position 방식으로 재정의한다. `scrollbar-hide`는 전역 유틸로 정의한다. `prose` 클래스는 제거한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-022 [P3] `app/[lang]` 밖 라우트에 Tailwind 미적용 — 404는 인라인 스타일, auth 레이아웃은 무스타일(추정)

- **근거**: 전역 CSS는 `app/[lang]/layout.tsx:2`에서만 import한다. 실측 404에서 `flex hidden` 프로브의 display가 `block`이어서 Tailwind 유틸이 없다. 그래서 `app/not-found.tsx`는 인라인 style 16개와 hex 27개로 구현돼 있다. `app/auth/layout.tsx:13-14`는 Tailwind 클래스(`min-h-screen flex items-center…`)에 의존하므로 OAuth 콜백 직접 진입 시 정렬이 빠질 것으로 추정한다(인증 흐름이라 방문하지 않음).
- **영향**: 에러·인증 화면이 디자인 시스템 밖에 있어 브랜드 불일치가 생긴다(404 title "Picnic", 주황·초록 그라데이션). 인증 로딩 화면이 깨져 보일 수 있다.
- **최소 수정**: `app/auth/layout.tsx`와 `app/not-found.tsx`에서 전역 CSS를 import하거나, 공통 CSS를 루트 `app/layout.tsx`로 올린다(중복 로드·순서 확인). 404는 토큰 클래스로 재작성한다.
- **작업량**: S · **회귀 위험**: 낮음~중간(CSS 로드 순서).

#### DES-023 [P3] 다크모드 미지원, `color-scheme` 미선언, create-next-app 배경 잔재

- **근거**: `dark:` 0회. CSS 다크 규칙 0(에뮬레이션 실측). `color-scheme` 메타·속성 없음. `app/[lang]/globals.css:5-19` body 그라데이션(rgb 214,219,220 → 흰색)이 남아 있다. `app/layout.tsx:90` `<div className="bg-white">`로 가려지지만 로그인 등에서 body 배경이 계산된다.
- **영향**: 현재는 일관되게 라이트다. 일부 브라우저(Chrome Android 자동 다크, Samsung Internet)의 강제 다크화가 예측 불가능하게 적용될 수 있다(추정).
- **최소 수정**: 당장은 `color-scheme: light`(강제 다크 차단이 필요하면 `only light`)를 선언하고 잔재 그라데이션을 제거한다. 다크모드는 시맨틱 토큰(DES-007) 도입 후 별도 과제(L)로 한다.
- **작업량**: S(선언) / L(다크모드) · **회귀 위험**: 낮음.

#### DES-024 [P3] 폰트 전략 — Inter latin만 로드, 한중일 문자는 OS 폴백

- **근거**: `app/layout.tsx:16-20` `Inter({ subsets: ['latin'], preload: false })`. 실측 body font-family는 `Inter, "Inter Fallback"`이다. `tailwind.config.js`에 fontFamily 토큰이 없다.
- **영향**: 한국어·일본어·중국어가 OS마다 다른 폰트(Apple SD Gothic Neo, Malgun Gothic, Noto 등)로 렌더링돼 자간과 높이가 달라진다. 영문(Inter)과 한글의 x-height 차이로 혼합 문장의 리듬이 깨진다. 잘못된 lang(DES-002)과 겹치면 ja·zh 글리프 문제가 커진다.
- **최소 수정**: 한국어 중심이면 Pretendard(가변, 서브셋), 다국어면 Noto Sans KR/JP/SC를 로케일별로 `next/font`에 등록하고 `fontFamily.sans` 토큰으로 노출한다.
- **작업량**: M · **회귀 위험**: 중간(폰트 용량 → LCP. `display: swap`과 서브셋 필요).

#### DES-025 [P3] 로딩 UX — 초기 HTML이 스켈레톤 위주, 스켈레톤·스피너 규칙 부재

- **근거**: `/ko/vote` SSR HTML에 `BAILOUT_TO_CLIENT_SIDE_RENDERING` 7회, `animate-pulse` 57회. `loading.tsx` 14개가 각자 스켈레톤을 쓴다. 인라인 `animate-spin`이 18곳이다. 번역 로드 전 `''` 반환(DES-005)으로 스켈레톤이 끝난 뒤에도 라벨이 빈 구간이 있다.
- **영향**: 느린 회선에서 스켈레톤→빈 라벨→완성의 3단계 깜빡임이 생긴다. 스켈레톤 모양이 실제 레이아웃과 달라지기 쉽다(유지보수 17곳).
- **최소 수정**: Skeleton 프리미티브를 만들고 화면별 스켈레톤을 조합형으로 바꾼다. CSR bailout 지점(`dynamic(…, { ssr: false })`, `useSearchParams`)을 점검한다(성능 감사와 공동).
- **작업량**: M · **회귀 위험**: 낮음.

#### DES-026 [P3] 개발자향 메시지가 사용자에게 노출됨

- **근거**: 상세 페이지 로드마다 토스트 "실시간 연결 성공"이 뜬다(`components/client/vote/detail/useVotePolling.ts:179-180`, 390px에서 헤더를 덮음). 모든 게스트 페이지 콘솔에 `⚠️ [AuthStore] 쿠키에서 유효한 사용자 정보 없음` 경고가 찍힌다(프로덕션 `removeConsole`이 `warn`을 제외함, `next.config.js`).
- **영향**: 불필요한 알림으로 주의가 분산되고 핵심 영역을 가린다. 콘솔 노이즈가 모니터링 신호를 흐린다.
- **최소 수정**: 토스트는 "연결 끊김 → 복구" 때만 띄우고 t() 키로 옮긴다. 게스트 상태 경고는 debug 레벨로 내린다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-027 [P3] 목록 카드 카운트다운 단위 미표시

- **근거**: `components/client/vote/list/VoteCard.tsx:223-230` `CountdownTimer … showUnits={false}`. 스크린샷의 "00 16 44 14" 옆에 "방금 전/Just now".
- **영향**: 일·시·분·초인지, 시·분·초·?인지 모호하다. 스크린리더는 숫자 4개만 읽는다.
- **최소 수정**: 작은 단위 라벨을 표시하거나 `aria-label="종료까지 16시간 44분"`(t 키)을 붙인다. "방금 전"은 "업데이트: 방금 전"으로 의미를 명확히 한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-028 [P3] 하드코딩 영어 라벨과 일본어 오타

- **근거**: 영역 칩 라벨이 `stores/voteFilterStore.ts:30-34`('ALL', 'PIC CHART'…)에, 그룹 `aria-label='Vote type'`이 `components/client/vote/list/VoteAreaFilter.tsx:34`에 하드코딩돼 있다. `components/client/star-candy/StarCandyProductsPresenter.tsx:247-262`는 언어별 삼항 연산자로 문장을 조립하고, `:260`에 **`'をご확認ください。'`**(일본어 문장에 한글 '확')가 있다. 이 문장은 ko·ja·zh·id만 분기하고 나머지는 영어다.
- **영향**: 일본어 사용자에게 깨진 문장이 보이고, 한국어 페이지에 "ALL"이 노출된다.
- **최소 수정**: 칩의 "ALL"과 aria는 t() 키로 옮긴다(브랜드성 영역명은 유지 가능). 환불 안내 문장은 보간 키(`{termsLink}`) 하나로 바꾸고 오타를 제거한다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-029 [P3] 모션 감소 설정 미반영(배너 제외), 무한 애니메이션 198곳

- **근거**: `prefers-reduced-motion` 참조는 `components/client/banner/useBannerCarousel.ts:90` 1곳뿐이다. framer-motion을 import하는 파일이 9개이고, `animate-(pulse|blob|scale-pulse|shimmer|bounce|ping)`이 198회 쓰인다. 예: 1위 배지 `animate-pulse`(`VoteDetailPresenter.tsx:113`), 초 단위 `animate-pulse`(`:53`).
- **영향**: 전정기관 장애 사용자에게 불편을 준다(WCAG 2.3.3 권고). 배터리 소모도 늘어난다.
- **최소 수정**: 반복 애니메이션에 `motion-safe:` 접두를 붙이고, framer-motion은 `MotionConfig reducedMotion="user"`로 감싼다.
- **작업량**: S~M · **회귀 위험**: 낮음.

#### DES-030 [P3] 포커스 표시 제거 4곳, 캐러셀 일시정지 수단 없음

- **근거**: 대체 스타일 없는 `focus:outline-none`이 4곳이다: `app/[lang]/(mypage)/mypage/qna/new/page.tsx:196`·`226`, `app/[lang]/(mypage)/mypage/qna/[thread_id]/QnaMessageList.tsx:105`·`143`. 캐러셀 자동재생(`useBannerCarousel.ts:208-221`, 5초)은 수동 조작·비가시·모션 감소 시 멈추지만, 일시정지 버튼이나 hover·focus 정지는 없다.
- **영향**: 키보드 사용자가 QNA 입력 위치를 잃는다(WCAG 2.4.7). 자동 이동 콘텐츠 제어가 약하다(WCAG 2.2.2, 부분 충족).
- **최소 수정**: `focus-visible:ring-2 ring-primary-600`을 추가한다. 캐러셀에 일시정지 토글이나 hover·focus 정지를 넣는다.
- **작업량**: S · **회귀 위험**: 낮음.

#### DES-031 [P3] SEO 위생 — 플레이스홀더 검증 메타, mask-icon 404, manifest 이원화

- **근거**: `metadata-utils.ts:79-81`의 값이 프로덕션에 그대로 나간다: `google-site-verification=YOUR_VERIFICATION_CODE`, `yandex-verification=YOUR_YANDEX_VERIFICATION_CODE`. `metadata-utils.ts:72-74`의 mask-icon `/favicon/safari-pinned-tab.svg`는 **404**다(curl). manifest는 레이아웃이 `/manifest.json`(`app/[lang]/layout.tsx`), 페이지 metadata가 `/site.webmanifest`(`metadata-utils.ts:78`)여서 페이지마다 다르다(`/ko/vote`는 site.webmanifest). vote 목록 JSON-LD URL이 로케일 없는 `${SITE_URL}/vote`이고 이름이 한국어 고정이다(`vote/page.tsx:100-110`).
- **영향**: 잘못된 소유권 메타가 노출되고, 불필요한 404가 생기며, PWA 메타가 불일치한다.
- **최소 수정**: 검증 메타를 제거하거나 환경변수로 바꾼다. mask-icon은 제거하거나 파일을 추가한다. manifest를 하나로 통일한다. JSON-LD URL과 이름을 로케일화한다.
- **작업량**: S · **회귀 위험**: 없음에 가까움.

## 우선 개선 Top 10 (효과/비용 순)

| 순위 | ID | 작업 | 효과 | 비용 |
|---:|---|---|---|---|
| 1 | DES-002 | middleware에서 언어 헤더 주입 → `<html lang>` 교정(x-pathname 전체 활성화는 별도 단계) | 11개 로케일 스크린리더·번역·폰트 선택 정상화, 한국어 줄바꿈(DES-020) 로케일 적용의 전제 | S |
| 2 | DES-006 | 누락 키 14개 추가 + `en` 폴백 사전 상시 로드 | 6개 언어 결제·충전 화면의 빈 라벨 제거 | S |
| 3 | DES-001 | 레이아웃 canonical 기본값 제거 + 투표 상세 `generateMetadata`(제목·OG 이미지·canonical) | sitemap의 상세 2,916 URL이 자기 자신을 canonical로 선언, 공유 카드 개선 | M |
| 4 | DES-016 | hreflang 12개 언어 + x-default, ko를 `/ko`로, og:locale·og:url | 지역별 올바른 언어 페이지 노출 | S |
| 5 | DES-015 | 브랜드 표기 결정 + 언어별 title 템플릿 | 검색 결과·탭의 브랜드 일관성, 영어 페이지 한국어 title 제거 | S |
| 6 | DES-003 | 후보 카드 `<button>`화 + VoteDialog를 공통 Dialog로 | 키보드·스크린리더 사용자의 투표 가능(핵심 전환 경로) | M |
| 7 | DES-004 | 투표 상세·토스트·오류 문자열 t()화, 날짜 로케일화(TZ 유지) | 11개 언어 사용자의 핵심 화면 번역 완성 | M |
| 8 | DES-008 | 텍스트용 브랜드 색 #7152F5·BETA orange-700·보조 텍스트 gray-500 | 탭·배지·배너 대비 AA 충족 | S |
| 9 | DES-012 | 목록 득표율 분모를 전체 합계로 | 목록↔상세 수치 일치(신뢰) | S |
| 10 | DES-018 | 배너 링크 이름 폴백 + 로케일 링크 정규화 | 배너 8개 링크 접근성, 언어 이탈 방지 | S |

그다음 순서: DES-014(광고 앵커, 수익 판단 필요), DES-007(primary 스케일 재정의, 8번과 묶으면 효율적), DES-017(랜드마크·h1), DES-013(오류 상태 통합), DES-010(미사용 32개 파일 삭제).

## 건드리면 안 되는 것

- `components/client/vote/list/VoteStatusFilter.tsx`의 listbox 패턴(roving tabIndex, `aria-selected`, 키보드 이동)은 이 레포의 접근성 모범 사례다. 다른 드롭다운의 기준으로 삼고 퇴행시키지 말 것.
- `components/client/banner/useBannerCarousel.ts`의 `prefers-reduced-motion` 존중과 비가시 시 자동재생 정지 로직.
- `components/client/vote/detail/useVoteDetail.ts:229`의 `timeZone: 'Asia/Seoul'` 명시. SSR·CSR hydration mismatch 방지용이다. 로케일만 바꾸고 TZ는 유지한다.
- 배너 영역의 CLS 방지 장치: `app/[lang]/(main)/vote/page.tsx:129`의 `min-h-[180px]`, `BannerItem.tsx`의 `aspect-ratio: 700/356`.
- `components/ui/Dialog/*`(Headless UI 기반)와 `DialogProvider`의 공개 API. 사용처 4곳(`ClientLayout`, `MainLayoutClient`, `hooks/auth/useOAuthError.ts`, `hooks/useWithdrawalGuard.ts`)이 의존한다. 통합의 기준으로 쓰되 시그니처는 바꾸지 말 것.
- `components/layouts/Footer.tsx:18-24`의 사업자 정보(상호·사업자등록번호·통신판매업번호·주소)는 전자상거래 법정 표기다. 영문 병기는 가능하지만 임의 삭제·축약은 하지 말 것.
- `next.config.js`의 `redirects()` 블록(VOTE 단독화 범위의 단일 출처이자 롤백 지점). QNA와 `/media`는 삭제 대상이 아니다. 컴포넌트 정리(DES-010) 중 `app/[lang]/(mypage)/mypage/qna/*`, `QnaMediaModal`, `components/client/media/*`를 지우지 말 것.
- `x-pathname` 주입은 한 번에 켜지 말 것. `VoteLiteClientLayout`(프로덕션 미검증)과 광고 지연·제외 분기가 동시에 활성화된다. DES-002의 단계적 방식을 따른다.
- 광고 로딩 타이밍 관련 주석과 로직(`app/layout.tsx:59-66`·`:79-88`, PICNIC-WEB-5C 대응)과 Sentry `thirdPartyErrorFilterIntegration` 설정. 광고 형식이나 지연을 바꾸면 Sentry 이슈 추이를 함께 확인한다.
- 미사용 번역 키(언어당 613개) 일괄 삭제 금지. `label_vote_${category}`, `goonghap_gender_${subCategory}` 같은 동적 키는 정적 스캔으로 잡히지 않는다.
- 미사용 컴포넌트 32개 일괄 삭제 금지. 정적 스캔 결과이므로 knip·빌드 확인 후 PR 단위로 나눈다. barrel(`components/*/index.ts`) 재수출도 함께 정리한다.
- middleware의 봇 UA 예외(OG 미리보기·크롤러를 `/open-in-browser`로 보내지 않음). SEO 수정 시 유지한다.
- DB 스키마. 득표율 합계 컬럼·RPC 등이 필요해지면 **picnic-supabase 이관 필요**. 이 레포에 `supabase/migrations/*.sql`을 추가하지 않는다.
