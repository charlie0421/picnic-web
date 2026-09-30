# 언어 접두어 라우팅 — 설계

- 날짜: 2026-10-01
- 근거: `docs/superpowers/specs/2026-09-30-root-layout-isr-design.md` §7 의 첫 후속 과제(미지원 언어 세그먼트와 접두어 없는 경로), 감사 계획 `docs/audit-2026-09-26/plan.md` §5.4 의 후속 항목
- 상태: 초안 2. 네 관점의 내부 검토를 반영했다. 사용자 검토 전이고 구현을 시작하지 않았다
- 브랜치: `fix/locale-prefix-routing` (워크트리 `picnic-web-locale-prefix`)
- 기준: 코드 `a1eedad6`(2026-10-01 Production), Next 15.5.26

용어

- **정규 언어**: `config/settings.ts` 의 `SUPPORTED_LANGUAGES` 12개와 글자 하나까지 같은 첫 세그먼트(`en`, `ko`, `zh-cn`, `zh-tw`, `ja`, `id`, `es`, `bn`, `tl`, `th`, `vi`, `my`).
- **표기 변형**: 지원 언어를 가리키지만 표기가 다른 첫 세그먼트(`KO`, `zh`, `zh_TW`, `en-US`, `%6Bo`).
- **선호 언어**: 주소에 언어가 없을 때 요청에서 고르는 언어(§4.2).
- **통과 목록**: 언어 세그먼트 밖에 실제로 있는 경로(§4.4).

## 1. 목표와 성공 기준

### 1.1 목표

1. 첫 세그먼트가 정규 언어가 아닌 주소가 `[lang]` 페이지로 200 렌더되지 않게 한다. 지금은 아무 문자열이나 언어로 받아 200 이나 `/<세그먼트>/vote` 307 을 돌려주고, ISR 전환(PR #103) 뒤에는 그런 주소마다 캐시 항목이 생긴다. middleware 를 거치는 주소는 `[lang]` 에 닿지 않게 하고, 거치지 않는 주소는 404 로 막는다(§4.5 의 한계 포함).
2. 언어 접두어 없는 앱 경로(`/login?error=…`, `/download`, `/rewards/1`, `/mypage/qna`)가 같은 경로의 언어판에 도착하게 한다. 쿼리를 보존한다.
3. 표기 변형을 정규 주소로 보낸다.
4. 밖에 고정된 주소를 살린다. 앱과 QR 의 `/download.html`, Play 스토어에 등록된 `/privacy_en.html`, 브라우저가 스스로 요청하는 `/favicon.ico`·`/apple-touch-icon*.png` 가 대상이다.
5. 정규 언어 경로, API, OAuth 콜백, 광고 플레이어, 정적 파일의 동작은 바꾸지 않는다. 의도한 예외는 둘이다. `/{언어}/auth/callback…` 이 404 에서 307 이 되고(§4.1 규칙 2), 루트 아이콘 주소가 307 에서 파일 200 이 된다.
6. 배포를 Vercel Instant Rollback 하나로 완전히 되돌릴 수 있게 한다. 영구 리다이렉트를 추가하지 않는다.

### 1.2 목표가 아닌 것

- 홈 `/` 의 언어. 이번에는 `/en/vote` 그대로 두고, 이 변경의 결과를 본 뒤 후속 PR 로 선호 언어 전환을 다룬다.
- 영어를 골라도 `locale` 쿠키가 기기 언어로 되돌아가는 버그(`LanguageSyncProvider`). 별도의 작은 PR 로 고친다(§7).
- 정규 언어 아래 잘못된 id 의 soft 404(`/ko/rewards/99999999` 가 200).
- 클라이언트 쪽 언어 판별 함수의 통합, `normalizeRedirectPath` 의 zh-cn·zh-tw 이중 접두어.
- `(bare)` 리다이렉트 스텁 삭제, `/open-in-browser` 의 308 과 언어 결정, `x-locale` 주입 제거.
- 코드 안의 없는 목적지(약관·개인정보의 `/contact`, PayPal `return_url`, `/auth/auth-code-error`).
- 접두어 없는 주소를 만드는 호출부(`VoteCard` 의 `/vote/:id` 등)의 수정.
- 표기 변형 정규화의 308 승격.

### 1.3 성공 기준

| 기준 | 확인 방법 |
|---|---|
| 접두어 없는 앱 경로가 middleware 의 307 한 번으로 `/{선호 언어}{경로}{쿼리}` 에 도착한다 | middleware 단위 테스트, `next start` curl, 머지 후 Production curl |
| 표기 변형이 307 로 정규 주소에 도착한다. 나머지 경로가 있으면 한 번, `/KO` 처럼 없으면 언어 루트 규칙까지 두 번이다 | 같음 |
| 언어 규칙과 next.config 의 리다이렉트를 합쳐 어떤 주소도 세 번 안에 끝나고, 같은 주소로 되돌아오지 않는다(인앱 안내와 apex 이동은 별도) | 연쇄 단위 테스트(§5.1). 시뮬레이션에서는 최대 두 번이다 |
| 정규 언어가 아닌 첫 세그먼트는 `[lang]` 페이지의 200 을 받지 못한다(307 또는 404) | §2 표의 "변경 후" 열 |
| middleware 를 거친 잘못된 주소는 `[lang]` 을 렌더하지 않고 ISR 항목도 만들지 않는다 | 목적지가 정적 404 인지 확인(`next start` 는 `x-nextjs-cache: HIT`, Production 은 `x-matched-path: /404`) |
| 통과 목록과 정규 언어 경로의 응답이 머지 전과 같다(목표 5 의 예외 둘 제외) | 머지 전후 비교(§6.2), 기존 middleware 테스트 |
| `/favicon.ico`, `/apple-touch-icon.png` 가 이미지 200 | curl |
| `/privacy_en.html` 은 `/en/privacy`, `/download.html` 은 `/{선호 언어}/download` 에 도착한다 | curl |
| 새 리다이렉트는 모두 307 이다 | 테스트(next.config 에 `permanent: true` 없음, middleware 응답 상태) |
| 사이트 안의 접두어 없는 이동이 보던 언어의 페이지에 도착한다 | 로컬 브라우저 확인(§5.5) |

## 2. 현재 동작, 변경 후 동작, 문제

"지금" 열은 2026-10-01 Production(`a1eedad6`)에서 GET 으로 잰 값이다. "변경 후" 열은 이 설계가 만드는 값이고, curl 처럼 쿠키·`Accept-Language`·`Referer` 가 없는 요청 기준이라 선호 언어가 `en` 이다. 머지 뒤 확인(§6.2)은 이 열과 대조한다.

| 요청 | 지금 | 변경 후 |
|---|---|---|
| `/login?error=x` | 307 `/login/vote`. 쿼리가 사라지고 투표 목록이 나온다 | 307 `/en/login?error=x`, 목적지 200 |
| `/download`, `/faq` | 307 `/<이름>/vote` | 307 `/en/download`, `/en/faq`, 목적지 200 |
| `/rewards/1`, `/notice/1`, `/mypage/qna` | 404 | 307 `/en/…`, 목적지 200 |
| `/vote/295` | 307 `/en/vote/295`. `(bare)` 스텁이 영어로 고정한다 | 307 `/en/vote/295`. middleware 가 선호 언어로 보낸다 |
| `/contact`, `/my-page`, `/auth`, `/auth/foo`, `/wp-admin`, `/.env` | 307 `/<세그먼트>/vote` 또는 404 | 307 `/en/…`, 목적지 404(`/en/wp-admin` 은 Vercel 이 403) |
| `/xx/rewards`, `/fr/vote` | 200. `[lang]` 이 그대로 렌더하고 ISR 항목이 된다 | 307 `/en/xx/rewards`, `/en/fr/vote`, 목적지 404 |
| `/KO/vote`, `/zh/vote`, `/zh-TW/rewards`, `/en-US/faq`, `/jp/vote`, `/%6Bo/vote` | 200 | 307 `/ko/vote`, `/zh-cn/vote`, `/zh-tw/rewards`, `/en/faq`, `/ja/vote`, `/ko/vote` |
| `/KO` | 307 `/KO/vote` | 307 `/ko`, 이어서 307 `/ko/vote` |
| `/api`, `/favicon.ico/vote` | 307 `/api/vote`, 200 | 307 `/en/api`, `/en/favicon.ico/vote`, 목적지 404 |
| `/favicon.ico`, `/apple-touch-icon.png`, `/apple-touch-icon-precomposed.png` | 307 `/<파일명>/vote` | 200 이미지 |
| `/privacy_en.html`, `/privacy_ko.html` | 307 `/<파일명>/vote` | 307 `/en/privacy`, `/ko/privacy`(next.config), 목적지 200 |
| `/download.html` | 307 `/download`(next.config), 이어서 307 `/download/vote` | 307 `/download`, 이어서 307 `/en/download` |
| `/sitemap-1.xml` | 307 `/sitemap-1.xml/vote` | 404(가드) |
| `/images/rewards`, `/api/rewards`, `/locales/faq`, `/.well-known/rewards`, `/_next/rewards`, `/_vercel/rewards` | 200. `[lang]` 의 rewards·faq 가 렌더된다 | 404(가드) |
| `/images/rewards/1.png`, `/favicon/notice/1` | 200. 상세 페이지가 렌더된다 | 404(가드) |
| `/images/sitemap.xml`, `/api/sitemap.xml` | 200. 전체 sitemap 이 나온다 | 200 그대로(§4.5 의 한계) |
| `/ko/auth/callback/google` | 404 | 307 `/auth/callback/google` |
| `/auth/callback/google/x` | 404 | 307 `/en/auth/callback/google/x`, 목적지 404 |
| `/xx/supabase-proxy/auth/v1/health` | Supabase 로 프록시(401) | 307 `/en/xx/supabase-proxy/…`, 목적지 404. 사용처가 없는 주소다 |
| `/%E0%A4%A/vote`(잘못된 percent-encoding) | 400. Vercel 이 앱에 넘기지 않는다 | 같음 |
| 인앱 UA 로 `/vote/123`(`Accept-Language: ko`) | 307 `/open-in-browser?returnTo=%2Fvote%2F123` | 307 `/ko/vote/123`. 그 주소는 307 `/open-in-browser?returnTo=%2Fko%2Fvote%2F123` |
| `/auth/callback`, `/auth/loading`, `/ads/shortform/player`, `/open-in-browser`, `/sitemap.xml`, `/ko/sitemap.xml`, `/robots.txt`, `/api/banners`, `/ko/vote`, `/ko/rewards` | 각자의 응답 | 같음 |

원인

1. `app/[lang]` 은 제약 없는 동적 세그먼트라 어떤 첫 세그먼트든 받는다. `app/[lang]/page.tsx` 는 받은 값을 그대로 써서 `/{값}/vote` 로 보낸다.
2. 2025-08-11 커밋 `023edcfd` 가 middleware 의 언어 리다이렉트를 지웠다. 그때의 선호 언어 함수 두 개(`getPreferredLanguage`, `getPreferredLanguageFromHeader`)는 호출되지 않는 코드로 남아 있다.
3. matcher 가 이름의 앞부분만 보고 제외하는 항목(`api`, `favicon.ico`, `sitemap-.*\.xml`)과 디렉터리 제외(`images/`, `locales/`, `favicon/`, `.well-known/`) 아래의 없는 경로는 middleware 를 거치지 않고 `[lang]` 에 닿는다.
4. PR #103 뒤 rewards·faq·notice·download 가 ISR 이라, 위 주소들이 주소마다 캐시 항목이 된다.

피해

- 앱 설정의 `download_link` 와 QR 이 가리키는 `/download.html` 이 투표 목록에 도착한다.
- Play 스토어의 개인정보처리방침 주소 `/privacy_en.html` 이 투표 목록에 도착한다.
- 인증 오류 경로(`/auth/callback` 에 code 가 없을 때 등)가 만드는 `/login?error=…` 의 쿼리가 사라져 오류 안내가 뜨지 않는다.
- 잘못된 언어의 페이지가 200 과 `index, follow` 로 나간다.
- 런타임 error 로그의 상위가 이 주소들이다. 2026-10-01 기준 24시간 동안 `/download/vote` 67건, `/favicon.ico/vote` 17건, `/login/vote` 9건, `/apple-touch-icon.png/vote` 4건이다(지원하지 않는 언어의 번역 파일을 읽다 실패한 로그. 조회 방법은 §6.4).

## 3. 접근법 선택

설계안 세 개를 따로 만들고 세 관점에서 반박 검증했다(2026-09-30). 점수는 10점 만점이다.

| 안 | 요약 | 정확성 | 운영 | 단순성 |
|---|---|---|---|---|
| **1. 언어가 없으면 붙인다** | 정규 언어와 통과 목록 밖의 주소에 선호 언어를 붙여 307. 없는 경로는 Next 의 정적 404 가 받는다 | 8 | 6.5 | 8 |
| 2. 아는 경로만 보정 | 라우트 표에 있는 경로만 보정하고 나머지는 middleware 가 바로 404 | 7 | 8 | 5.5 |
| 3. 영구 리다이렉트와 Referer | 변형은 308, 분류 실패는 404 | 5.5 | 5.5 | 5 |

1안을 채택했다(사용자 승인 2026-10-01). 라우트 표가 없어서, 접두어 없이 들어온 주소는 `[lang]` 아래에 실제 페이지가 있으면 언어판으로 도착한다(2안은 표에 없으면 404 다). 페이지를 추가할 때 middleware 를 고칠 일이 없다. 전부 307 이라 롤백이 깨끗하다. 반대로 언어 세그먼트 밖의 실제 라우트가 통과 목록에서 빠지면 404 가 된다(§6.5 의 첫 리스크).

다른 안과 심사에서 가져온 것

- 선호 언어를 붙이는 307 에 `Cache-Control: private, no-store` 를 명시한다(3안).
- 표기 변형을 정규화하기 전에 "언어 태그 모양" 검사를 둔다. `/my-page` 가 버마어(`my`)로 오인되는 것을 막는다(정확성 심사).
- 같은 사이트의 직전 페이지 언어를 선호 언어의 첫 신호로 쓴다(3안의 Referer). 이유는 §4.2 에 있고, 승인된 기본값에 없던 항목이라 §9 에서 확인을 요청한다.
- 홈 `/` 전환과 `/open-in-browser` 의 언어 결정 변경은 이 PR 에서 뺀다(운영·단순성 심사).

가져오지 않은 것과 이유

- matcher 에 `[lang]` 라우트 모양 목록을 넣어 디렉터리 구멍을 닫는 방식(2안). 페이지를 추가할 때마다 matcher 와 표와 파일을 함께 고쳐야 해서 1안의 장점이 사라진다. 남는 구멍은 §4.5 의 가드가 404 로 막는다.
- matcher 의 디렉터리 제외를 "확장자가 있는 파일"로 좁히는 방식(3안). `/images/rewards/1.png` 처럼 확장자가 붙은 상세 주소는 계속 새므로 가드가 여전히 필요하고, 닫히는 것은 개수가 정해진 목록 주소뿐이다.
- `app/api/[...slug]` catch-all(3안). 없어도 가드가 막는다.
- 미지원 언어 모양(`/fr/vote`)을 선호 언어로 바꿔 주는 규칙. 승인된 기본값대로 404 로 끝낸다.
- 과거 버그가 만든 `/<경로>/vote`(`/download/vote`, `/login/vote`)를 원래 페이지로 되돌리는 규칙. 새 규칙이 들어가면 더는 만들어지지 않는다. 머지 뒤 404 건수를 보고 정한다(§6.4).

## 4. 설계

### 4.1 규칙

middleware 가 요청의 첫 세그먼트를 한 번 판정한다. 위에서부터 처음 맞는 줄을 적용한다.

| # | 조건 | 예 | 동작 |
|---|---|---|---|
| 1 | 경로가 `/` | `/`, `/?error=…` | 그대로 통과. next.config 가 먼저 `/en/vote` 로 보낸다(현행) |
| 2 | 첫 세그먼트가 정규 언어이고 나머지가 콜백 라우트 모양(`/auth/callback` 또는 `/auth/callback/<한 세그먼트>`) | `/ko/auth/callback/google?code=…` | 307 `/auth/callback/google?code=…`. 언어를 뗀다 |
| 3 | 첫 세그먼트가 정규 언어 | `/ko/vote`, `/zh-tw/vote/295?status=ongoing`, `/ko/auth/callback/a/b` | 그대로 통과(기존 흐름) |
| 4 | 첫 세그먼트를 디코드할 수 없다 | `/%E0%A4%A/vote` | 그대로 통과(현행. Production 은 Vercel 이 먼저 400) |
| 5 | 통과 목록(§4.4) | `/auth/callback/google`, `/open-in-browser`, `/supabase-proxy/…` | 그대로 통과(기존 흐름) |
| 6 | 첫 세그먼트가 표기 변형 | `/KO/vote?a=1`, `/zh/vote`, `/zh_TW/rewards`, `/en-US/faq`, `/jp/vote`, `/%6Bo/vote` | 307 `/{정규 언어}{나머지}{쿼리}` |
| 7 | 그 밖 전부 | `/login?error=x`, `/download`, `/rewards/1`, `/vote/295`, `/xx/rewards`, `/fr/vote`, `/wp-admin`, `/auth/foo` | 307 `/{선호 언어}{원래 경로}{쿼리}` |

- 7번의 목적지가 실제 페이지면 그 페이지가 나오고, 없는 경로면 Next 의 정적 404 가 나온다. middleware 는 404 를 직접 만들지 않는다.
- 모든 새 리다이렉트는 307 이고 `Cache-Control: private, no-store` 를 붙인다. 307 은 메서드와 본문을 유지한다.
- 목적지는 항상 같은 출처의 `/{정규 언어}/…` 또는 콜백 라우트라 외부로 보내는 리다이렉트가 되지 않는다.
- 규칙 2 와 통과 목록은 콜백 라우트를 같은 정규식으로 판정한다. 둘이 어긋나면 `/auth/callback/google/x` 같은 주소가 규칙 7(언어 붙임)과 규칙 2(언어 뗌)를 오가며 끝나지 않는다. 같은 모양을 쓰면 6번·7번의 목적지는 다음 요청에서 반드시 통과로 끝난다(규칙 2 의 목적지는 통과 목록, 6번의 목적지는 규칙 2 또는 3, 7번의 목적지는 규칙 3).
- `/KO` 처럼 나머지가 없는 변형은 `/ko` 로 보내고, 그다음 next.config 의 언어 루트 규칙이 `/ko/vote` 로 보낸다. middleware 가 언어 홈이 `/vote` 라는 것을 따로 알 필요가 없게 한다.

### 4.2 언어 결정

`lib/i18n/locale-routing.ts` 의 순수 함수가 맡는다(§4.3 의 파일 구성).

**`normalizeLanguageTag(tag)`** 는 언어 태그를 지원 언어로 바꾼다. 못 바꾸면 `null` 이다.

1. 앞뒤 공백을 떼고 소문자로 바꾸고 `_` 를 `-` 로 바꾼다.
2. 지원 목록과 같으면 그 값이다.
3. 별칭: `zh` 는 `zh-cn`, `jp` 는 `ja`, `fil` 은 `tl`.
4. 주 언어가 `zh` 면 하위 태그를 본다. `hans` 가 있으면 `zh-cn`, `hant` 가 있으면 `zh-tw`, 둘 다 없고 `tw`·`hk`·`mo` 가 있으면 `zh-tw`, 나머지는 `zh-cn` 이다(`zh-Hans-TW` 는 `zh-cn`).
5. 주 언어가 별칭이면 별칭의 값, 지원 언어면 그 값이다(`en-US` 는 `en`, `fil-PH` 는 `tl`).

**`classifyFirstSegment(raw)`** 는 첫 세그먼트를 넷 중 하나로 가른다.

1. 지원 목록에 그대로 있으면 `canonical`. 디코드도 하지 않는다.
2. `decodeURIComponent` 가 실패하면 `undecodable`.
3. 디코드한 값이 언어 태그 모양이 아니면 `other`.
4. `normalizeLanguageTag` 가 값을 주면 `variant`, 아니면 `other`.

언어 태그 모양은 아래 정규식이다. 주 언어를 두 글자로, 문자(script) 하위 태그를 `hans`·`hant` 로 제한해 `/my-page`, `/id-card`, `/en-route`, `/my_page` 가 언어로 오인되지 않는다. `/api`, `/ads`, `/faq` 같은 세 글자 세그먼트와도 겹치지 않는다.

```
^[a-z]{2}(?:[-_](?:[a-z]{2}|\d{3}|hans|hant))?(?:[-_][a-z]{2})?$   (대소문자 무시)
```

**`resolvePreferredLanguage(signals)`** 는 주소에 언어가 없을 때 쓸 언어를 고른다. `signals` 는 `{ referer, host, cookieLocale, acceptLanguage }` 이고 middleware 가 요청에서 뽑아 넘긴다(`Referer` 헤더, `Host` 헤더, `locale` 쿠키, `Accept-Language` 헤더).

1. `Referer` 의 호스트가 요청의 `Host` 헤더와 같고 경로가 정규 언어로 시작하면 그 언어. 사이트 안에서 접두어 없는 주소로 이동한 경우다.
2. `locale` 쿠키를 `normalizeLanguageTag` 로 바꾼 값.
3. `Accept-Language`. q 값이 큰 순서로 보고(같으면 적힌 순서), `*` 와 q=0 과 q 를 숫자로 읽을 수 없는 태그는 버리고, 처음으로 지원 언어가 되는 태그를 쓴다.
4. 기본 언어 `en`.

- 1번의 비교 대상을 `req.nextUrl.origin` 이 아니라 `Host` 헤더로 하는 이유: 로컬 `next start` 에서 `nextUrl.origin` 은 `http://localhost:포트` 로 고정이라 `127.0.0.1` 로 접속하면 어긋난다(프로브로 확인). Production 의 `Host` 는 공개 호스트다.
- 옛 `NEXT_LOCALE` 쿠키는 더 읽지 않는다. 쓰는 곳이 없다.
- 주소에 언어가 적혀 있으면(표기 변형) 주소가 이긴다.
- middleware 는 쿠키를 쓰지 않는다. ISR 응답에 `Set-Cookie` 가 섞이지 않게 하기 위해서다.

1번 신호를 두는 이유. 사이트 안의 접두어 없는 이동은 보던 페이지의 언어로 도착해야 한다. 투표 카드의 순위 영역 클릭(`VoteCard` 의 `window.location.href = '/vote/:id'`), 오류 화면의 `/login` 이동, 알림의 `action_url` 이동이 여기에 해당한다. 쿠키만 보면 다음 두 부류의 사용자는 보던 언어와 다른 언어로 간다. 다른 언어의 공유 링크로 들어온 사용자(쿠키는 `ko`, 보는 페이지는 `/en/…`)와, 영어를 골랐지만 쿠키가 기기 언어로 되돌아간 사용자다(§7 의 버그). 지금은 `/vote/:id` 가 스텁을 거쳐 언제나 영어로 가므로, 한국어 페이지를 보던 사용자가 영어 상세로 떨어진다.

`Referer` 에 경로가 실리는 것은 앱의 referrer 정책 덕분이다. `[lang]` 의 메타데이터가 `referrer: 'origin-when-cross-origin'` 을 내보내고(`app/[lang]/utils/metadata-utils.ts`), 이 정책은 같은 출처 요청에 전체 주소를 보낸다. 이 값을 `origin`·`strict-origin`·`no-referrer` 로 바꾸면 1번 신호가 조용히 사라지므로, 정책 값을 고정하는 테스트를 둔다(§5.4). `Referer` 가 없거나 조건에 맞지 않으면 2번부터 본다.

### 4.3 middleware 구조

파일 구성

- `lib/i18n/locale-routing.ts` (새 파일, 순수 함수. `config/settings` 만 import 해서 Edge 에서 쓸 수 있다)
  - `normalizeLanguageTag`, `classifyFirstSegment`, `resolvePreferredLanguage`
  - `STATIC_ASSET_PATH`, `NON_LOCALIZED_PATH`, `AUTH_CALLBACK_PATH`, `isPassThroughPath(pathname)`
  - `decideLocaleRoute(pathname, signals)`: `{ type: 'pass', lang }` 또는 `{ type: 'redirect', pathname }` 를 돌려준다. §4.1 의 규칙 전부가 여기에 있다
- `middleware.ts`: 요청에서 신호를 뽑아 `decideLocaleRoute` 를 부르고, 결과를 응답으로 바꾼다. `STATIC_ASSET_PATH` 는 새 모듈에서 가져온다(인앱 판정이 계속 쓴다)

새 판정은 맨 앞에 둔다. 인앱 브라우저 안내, Supabase 클라이언트 생성, `getClaims` 보다 먼저다.

```ts
// lib/i18n/locale-routing.ts
export function decideLocaleRoute(pathname: string, signals: LanguageSignals): LocaleRouteDecision {
  if (pathname === '/') return { type: 'pass', lang: null };

  const first = pathname.split('/')[1] ?? '';
  const rest = pathname.slice(first.length + 1);           // '' 또는 '/…'
  const segment = classifyFirstSegment(first);

  if (segment.kind === 'canonical') {
    if (AUTH_CALLBACK_PATH.test(rest)) return { type: 'redirect', pathname: rest };
    return { type: 'pass', lang: segment.lang };
  }
  if (segment.kind === 'undecodable' || isPassThroughPath(pathname)) return { type: 'pass', lang: null };
  if (segment.kind === 'variant') return { type: 'redirect', pathname: `/${segment.lang}${rest}` };
  return { type: 'redirect', pathname: `/${resolvePreferredLanguage(signals)}${pathname}` };
}

// middleware.ts
export async function middleware(req: NextRequest) {
  const decision = decideLocaleRoute(req.nextUrl.pathname, {
    referer: req.headers.get('referer'),
    host: req.headers.get('host'),
    cookieLocale: req.cookies.get('locale')?.value ?? null,
    acceptLanguage: req.headers.get('accept-language'),
  });
  if (decision.type === 'redirect') {
    const url = req.nextUrl.clone();
    url.pathname = decision.pathname;                       // 쿼리는 그대로 남는다
    const redirect = NextResponse.redirect(url, 307);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }
  const res = NextResponse.next({
    request: { headers: buildForwardedRequestHeaders(req, decision.lang) },
  });
  // 이하 기존과 같다: 인앱 안내 → Supabase 환경 확인 → getClaims → 탈퇴 차단
}
```

이 자리에 두는 이유

- 리다이렉트 응답은 Supabase 가 쿠키를 쓰기 전에 나간다. 갱신된 세션 쿠키를 새 응답으로 옮길 일이 없다(탈퇴 차단 분기는 지금 그 복사를 한다). 세션 갱신과 탈퇴 차단은 목적지 요청에서 middleware 가 다시 돌 때 적용되므로 우회되지 않는다.
- 인앱 브라우저 사용자는 정규 주소가 된 뒤에 안내를 받는다. `returnTo` 가 정규 주소가 되고 안내 페이지의 언어가 경로의 언어와 같아진다. 대신 접두어 없는 주소를 인앱으로 열면 이동이 한 번 늘어난다(§4.8).
- 잘못된 주소는 `getClaims` 와 프로필 조회 없이 끝난다.
- 정규 언어 요청이 추가로 하는 일은 집합 조회 한 번과 콜백 모양 검사 한 번이다. 지금 매 요청 하는 디코드와 소문자 변환은 이 경로에서 없어진다.

함께 정리하는 것

- `extractLangFromPath`, `getPreferredLanguage`, `getPreferredLanguageFromHeader` 를 지운다. 새 모듈이 대신한다.
- `buildForwardedRequestHeaders` 는 판정한 언어를 인자로 받는다. `x-locale` 은 정규 언어일 때만 싣는다(지금과 같다. percent-encoding 된 언어는 이제 리다이렉트된다).
- 탈퇴 계정 리다이렉트의 언어 순서(경로의 언어, `locale` 쿠키, `en`)는 바꾸지 않는다. 경로의 언어를 구하는 함수만 새 판정 결과로 바꾼다.

### 4.4 통과 목록과 matcher

두 층이다. matcher 는 middleware 를 아예 부르지 않을 경로를 정하고, 코드 안의 통과 목록은 불렸지만 손대지 않을 경로를 정한다.

**코드 안의 통과 목록** (`isPassThroughPath`)

```
(읽기 쉽게 줄을 나눴다. 실제로는 각각 한 줄이다)

AUTH_CALLBACK_PATH  (규칙 2 와 통과 목록이 같이 쓴다)
^/auth/callback(?:/[^/]+)?/?$

STATIC_ASSET_PATH   (기존. 아이콘 파일을 더하고 sitemap 조건을 숫자 두 자리로 좁힌다)
^/(?:_next/|\.well-known/|images/|locales/|favicon/|concert2025/(?:image|video)/
   |(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)/sitemap\.xml$
   |(?:favicon\.ico|apple-touch-icon(?:-precomposed)?\.png|robots\.txt|ads\.txt|app-ads\.txt
      |sitemap(?:-\d{1,2})?\.xml|manifest\.json|site\.webmanifest
      |apple-developer-domain-association\.txt|firebase-messaging-sw\.js|emergency-auth-fix\.js)$)

NON_LOCALIZED_PATH  (새로 추가. 언어 세그먼트 밖의 실제 라우트)
^/(?:api/|_vercel/|supabase-proxy(?:/|$)|open-in-browser/?$
   |auth/callback(?:/[^/]+)?/?$|auth/loading/?$|ads/shortform/player/?$)
```

`isPassThroughPath` 는 두 정규식 가운데 하나에 맞으면 참이다. 개발 서버(`NODE_ENV` 가 `production` 이 아닐 때)에서는 `/__nextjs` 로 시작하는 경로도 통과시킨다. Production 에는 그런 경로가 없으므로 통과시키지 않는다.

- `(bare)` 의 실제 페이지는 첫 세그먼트가 아니라 라우트 단위로 적는다. `auth` 를 통째로 통과시키면 `/auth/rewards` 가 `[lang]=auth` 로 샌다.
- `(bare)` 의 리다이렉트 스텁 네 개(`/vote`, `/vote/:id`, `/mypage`, `/concert2025`)는 통과 목록에 넣지 않는다. middleware 가 먼저 선호 언어로 보낸다. 지금은 스텁이 `en` 으로 고정한다.
- `/_next/`, `/_vercel/` 은 통째로 통과시킨다. 프레임워크와 플랫폼의 내부 경로를 빠짐없이 알 수 없고, 하나라도 리다이렉트하면 피해가 크다. Vercel Analytics 의 `/_vercel/insights/script.js` 가 이 경로다. 그 아래의 조작된 주소(`/_next/rewards`)는 §4.5 의 가드가 막는다.

**matcher**

이름의 앞부분만 보던 항목을 정확한 이름으로 좁힌다.

| 지금 | 변경 |
|---|---|
| `api` | `api/` |
| `favicon.ico` | `favicon\.ico$` |
| `robots\.txt`, `app-ads\.txt`, `ads\.txt`, `sitemap\.xml`, `manifest\.json`, `site\.webmanifest`, `apple-developer-domain-association\.txt` | 각각 끝에 `$` |
| `sitemap-.*\.xml` | `sitemap-\d{1,2}\.xml$` |
| 없음 | `apple-touch-icon(?:-precomposed)?\.png$` 추가 |

`_next/static`, `_next/image`, 언어별 sitemap, `\.well-known/.*`, `images/`, `locales/`, `favicon/`, `concert2025/(image|video)/`, 서비스 워커 두 개는 그대로다. 디렉터리 안의 자산마다 middleware 를 부르지 않기 위해서다.

- 이렇게 하면 `/api`, `/apiary`, `/favicon.ico/vote`, `/sitemap-1.xml/x`, `/sitemap-foo.xml`, `/manifest.jsonx` 가 middleware 에 와서 7번 규칙을 탄다.
- `sitemap-\d{1,2}\.xml` 은 next-sitemap 이 주소가 5000개를 넘을 때 만드는 다음 파일을 미리 허용한다. 지금 있는 파일은 `sitemap-0.xml` 하나다. 파일이 없는 번호(`/sitemap-1.xml`)는 middleware 를 거치지 않고 가드의 404 를 받는다. 두 자리로 막아 이런 주소가 100개를 넘지 않게 한다.
- 조립한 matcher 를 Next 15.5.26 의 matcher 컴파일러(`unstable_doesMiddlewareMatch`)로 확인했다. git 이 추적하는 `public/` 파일 98개와 `app/api` 의 route 33개가 모두 제외되고, 위의 없는 이름들은 middleware 가 실행된다.

**동기화 테스트**

통과 목록은 손으로 적는 목록이라 파일시스템과 어긋날 수 있다. 테스트가 파일시스템에서 읽어 대조한다(§5.3).

**남는 구멍**

matcher 가 제외하는 디렉터리(`images/`, `locales/`, `favicon/`, `concert2025/(image|video)/`, `.well-known/`), `api/`, 통과시키는 내부 접두어(`_next/`, `_vercel/`) 아래에 `[lang]` 의 라우트 모양을 붙인 주소(`/images/rewards`, `/api/notice/7`, `/_next/rewards`)와, 이름으로 제외되는 없는 파일(`/sitemap-1.xml`)은 middleware 가 막지 못한다. §4.5 의 가드가 받는다.

### 4.5 `[lang]` 레이아웃 가드

`app/[lang]/layout.tsx` 의 `LanguageLayout` 첫머리에서 `lang` 이 정규 언어가 아니면 `notFound()` 를 부른다.

```tsx
const { lang } = await paramsPromise;
if (!isSupportedLanguage(lang)) notFound();
```

middleware 를 거치지 않는 페이지 요청의 마지막 방어선이다. `htmlLang` 의 `ko` 폴백은 닿을 수 없는 코드가 되므로 지운다.

버리는 프로브 빌드로 확인한 동작(2026-10-01, Next 15.5.26 과 15.5.23 에서 같은 결과)

- 응답은 404 이고 `<meta name="robots" content="noindex">` 가 붙는다. 본문은 Next 의 오류 셸이고 404 화면은 브라우저에서 그려진다.
- `app/[lang]/page.tsx` 의 `redirect` 보다 먼저 적용된다(`/favicon.icox` 가 307 이 아니라 404).
- 빌드와 `verify-rendering-modes` 는 그대로 통과한다(프리렌더 39, 온디맨드 10).
- ISR 라우트에서는 이 404 가 그 라우트의 `revalidate` 동안 캐시된다(`/images/rewards` 는 첫 요청 MISS, 다음 요청 HIT). 정적 라우트인 `[lang]/page.tsx` 에 닿는 주소(`/sitemap-1.xml`)는 다음 배포까지 캐시된다. 동적 라우트(`/api/vote`)에서는 캐시되지 않는다.
- 가드가 404 를 만들어도 그 요청의 페이지 코드는 실행된다. 서버 로그에 `Could not load translations for images` 가 그대로 남고, 페이지의 조회도 돈다.

한계

1. 가드는 응답을 200 에서 404 로 바꿀 뿐이고 비용을 없애지 못한다. 남는 구멍으로 들어온 주소는 페이지 코드를 실행하고, ISR 라우트라면 주소마다 캐시 항목(404)을 남긴다. `rewards/[id]`·`notice/[id]` 는 id 만큼 늘어난다.
2. 가드는 페이지에만 적용된다. `app/[lang]/sitemap.ts` 는 레이아웃을 거치지 않는 메타데이터 라우트라서 `/images/sitemap.xml`, `/api/sitemap.xml` 같은 주소는 지금처럼 전체 sitemap 을 200 으로 준다. 정규 주소(`/ko/sitemap.xml`)와 내용도 비용도 같다.

이 한계를 받아들이는 이유. 남는 구멍은 라우트 이름을 알고 조작한 요청에서만 생긴다. 같은 효과를 내는 기존 주소가 이미 있다. 정규 언어 아래 잘못된 id(`/ko/rewards/<아무 값>`)는 200 으로 캐시되고, `/ko/sitemap.xml` 은 누구나 요청할 수 있다. 구멍만 닫아도 그 주소들은 남는다. 완전히 닫으려면 matcher 에 라우트 모양 목록을 넣어야 하는데(§3), 잘못된 id 문제와 함께 다루는 것이 맞아 이번 범위에서 뺀다(§7). 머지 뒤 구멍으로 들어오는 요청 수를 본다(§6.4).

### 4.6 설정과 정적 파일

- `next.config.js` `redirects()` 에 두 줄을 더한다(`permanent: false`). 기존 항목은 건드리지 않는다.
  - `/privacy_en.html` → `/en/privacy`
  - `/privacy_ko.html` → `/ko/privacy`
- `/download.html` → `/download` 는 이미 있다. 이제 다음 요청에서 middleware 가 `/{선호 언어}/download` 로 보낸다. 지금도 두 번 이동하지만 투표 목록에 도착한다.
- `public/` 루트에 파일 세 개를 더한다. `public/favicon/` 의 파일을 복사한다.
  - `favicon.ico`
  - `apple-touch-icon.png`
  - `apple-touch-icon-precomposed.png`
- `vercel.json`, `rewrites()`, `headers()` 는 바꾸지 않는다.

### 4.7 바꾸지 않는 것

- next.config 의 `/` → `/en/vote`, `/:lang(12개)` → `/:lang/vote`, 옛 서비스 경로 리다이렉트.
- `(bare)` 의 리다이렉트 스텁 네 개와 `scripts/rendering-modes.js` 의 스텁 항목. 정상 흐름에서는 닿지 않게 되지만 첫 배포에서는 남겨 둔다. 주석만 고친다.
- `app/[lang]/page.tsx`, `generateStaticParams`(en·ko·my), 각 페이지의 `revalidate`.
- `app/[lang]/sitemap.ts`, `app/open-in-browser/route.ts`(308 과 언어 결정).
- 인앱 브라우저 판정, `getClaims`, 탈퇴 차단의 조건과 언어 순서.
- 클라이언트의 언어 판별(`useLocaleRouter`, `LanguageSyncProvider`, `auth-redirect-validators`)과 접두어 없는 주소를 만드는 호출부.

### 4.8 흐름 예

```
앱의 다운로드 링크 (www)
  https://www.picnic.fan/download.html
  → 307 /download                 (next.config)
  → 307 /ko/download              (middleware, Accept-Language: ko)
  → 200

QR 의 다운로드 링크 (apex)
  https://picnic.fan/download.html
  → 307 https://www.picnic.fan/download.html   (Vercel 도메인 리다이렉트)
  → 307 /download → 307 /ko/download → 200

인증 오류
  /auth/callback (code 없음)
  → 307 /login?error=auth_code_missing      ((bare) 페이지)
  → 307 /ko/login?error=auth_code_missing   (middleware, 쿠키 ko)
  → 200, 오류 안내 표시

사이트 안의 접두어 없는 이동 (/th/vote 에서 순위 영역 클릭)
  /vote/304   Referer: https://www.picnic.fan/th/vote
  → 307 /th/vote/304              (middleware, Referer)
  → 200

인앱 브라우저(카카오톡)로 /vote/123
  → 307 /ko/vote/123                                  (middleware, 새 규칙)
  → 307 /open-in-browser?returnTo=%2Fko%2Fvote%2F123  (middleware, 인앱 안내)
  → 308 /ko/open-in-browser?returnTo=…                (route handler)
  지금은 두 번이고 returnTo 가 /vote/123 이다. 한 번 늘지만 외부 브라우저에서 여는 주소가 언어판이 된다

인앱 브라우저로 /download.html
  → 307 /download → 307 /ko/download → 307 /open-in-browser?returnTo=%2Fko%2Fdownload → 308 /ko/open-in-browser?…
  지금은 세 번이고 외부 브라우저에서 /download 를 열면 투표 목록이 나온다. 네 번이 되지만 다운로드 페이지가 열린다

스캐너
  /wp-admin → 307 /en/wp-admin → 403(Vercel) 또는 정적 404
  /xx/rewards → 307 /en/xx/rewards → 정적 404
```

## 5. 테스트

구현은 TDD 로 한다. 아래는 있어야 할 테스트의 목록이다.

### 5.1 `lib/i18n/locale-routing.ts` (새 단위 테스트)

| 함수 | 사례 |
|---|---|
| `normalizeLanguageTag` | `KO`→`ko`, `zh_TW`→`zh-tw`, `ZH-Hant-TW`→`zh-tw`, `zh-Hans-TW`→`zh-cn`, `zh`→`zh-cn`, `zh-HK`→`zh-tw`, `zh-SG`→`zh-cn`, `en-US`→`en`, `es-419`→`es`, `jp`→`ja`, `fil-PH`→`tl`, `pt-BR`→`null`, 빈 문자열→`null` |
| `classifyFirstSegment` | `en`·`zh-tw`→canonical. `KO`·`zh`·`en-US`·`%6Bo`·`%7A%68-tw`→variant. `xx`·`fr`·`pt-BR`·`login`·`api`·`wp-admin`·`.env`·`favicon.ico`·`my-page`·`id-card`·`my_page`·빈 문자열→other. `%E0%A4%A`→undecodable |
| `resolvePreferredLanguage` | 호스트가 같은 Referer 가 쿠키보다 앞. 호스트가 다른 Referer, 정규 언어가 아닌 Referer(`/KO/vote`), 해석할 수 없는 Referer 는 무시. 쿠키가 Accept-Language 보다 앞. 잘못된 쿠키는 무시. q 정렬. q=0, `*`, 숫자가 아닌 q 의 태그는 버림(`th;q=abc,vi;q=0.3` 은 `vi`). 신호가 없으면 `en` |
| `isPassThroughPath` | §4.4 의 통과 경로는 참. `/auth`, `/auth/foo`, `/auth/callback/a/b`, `/ads`, `/open-in-browser/x`, `/api`, `/sitemap-foo.xml`, `/sitemap-123.xml`, `/__nextjs_foo`(production)는 거짓 |
| `decideLocaleRoute` | §4.1 의 규칙 일곱 줄 각각. `/`, `/ko/authx`, `/ko/auth/callbackx`, `/ko/auth/callback/a/b` 는 통과 |
| 연쇄 | 표본 주소 전부에 대해, 결정이 리다이렉트면 목적지를 다시 넣는다. next.config 의 리다이렉트도 흉내 낸다. 세 번 안에 통과로 끝나고 같은 주소가 다시 나오지 않는다. `/auth/callback/google/x`, `/ko/auth/callback/a/b`, `/KO/auth/callback/apple/a/b` 를 표본에 넣는다 |
| 목적지 | `//evil.com/x`, `/\evil.com`, `/%2F%2Fevil.com/x` 의 목적지 경로가 `/{정규 언어}/` 로 시작한다 |

### 5.2 middleware (`__tests__/middleware/locale-headers.test.ts` 와 새 파일)

새로 추가하는 사례

| 요청 | 기대 |
|---|---|
| `/`, `/?error=x` | 리다이렉트 없음 |
| `/login?error=x` | 307 `/en/login?error=x`. 쿠키 `locale=ja` 면 `/ja/…`, `Accept-Language: ko-KR` 면 `/ko/…`, 호스트가 같은 Referer `/th/vote` 면 `/th/…` |
| `POST /login` | 307(메서드를 바꾸는 302·303 이 아니다) |
| `/download`, `/rewards/1`, `/mypage/qna`, `/vote/295`, `/vote`, `/mypage`, `/concert2025` | 307 `/{선호}{경로}` |
| `/KO/vote?a=1`, `/zh-TW/rewards`, `/zh/vote`, `/%6Bo/vote`, `/KO` | 307 `/ko/vote?a=1`, `/zh-tw/rewards`, `/zh-cn/vote`, `/ko/vote`, `/ko` |
| `/xx/rewards`, `/fr/vote`, `/wp-admin`, `/.env`, `/auth`, `/auth/foo`, `/ads`, `/open-in-browser/x`, `/api`, `/my-page`, `/sitemap-foo.xml`, `/auth/callback/google/x` | 307 `/{선호}{경로}` |
| `/ko/auth/callback/google?code=c`, `/ko/auth/callback` | 307 `/auth/callback/google?code=c`, `/auth/callback` |
| `/ko/authx`, `/ko/auth/callbackx`, `/ko/auth/callback/a/b` | 통과 |
| `/auth/callback`, `/auth/callback/apple`, `/auth/loading`, `/ads/shortform/player`, `/open-in-browser`, `/supabase-proxy/rest/v1`, `/_next/data/x.json`, `/_vercel/insights/script.js` | 리다이렉트 없음. 인앱 UA 에서는 기존 인앱 규칙대로 |
| 리다이렉트 응답 | `Cache-Control: private, no-store`, `Set-Cookie` 없음, `getClaims` 호출 0회, Location 이 요청과 같은 출처 |
| 인앱 UA 로 `/login` | 307 `/en/login`. 이어서 `/en/login` 은 `/open-in-browser?returnTo=%2Fen%2Flogin` |
| 탈퇴 계정이 `/auth/loading` 요청(쿠키 `locale=ja`) | `/ja/login?error=withdrawn`(현행 순서 유지) |

바뀌는 기존 사례

- "percent-encoded 로케일 세그먼트도 x-locale 주입"(3건)은 정규 주소 307 단언으로 바꾼다.
- "로케일이 없는 경로 `/vote`"와 "지원하지 않는 접두사 `/xx/vote`"는 307 과 목적지 단언으로 바꾼다.
- "잘못된 percent-encoding 은 x-locale 없이 통과"는 그대로 둔다.
- 나머지(정규 언어의 `x-locale`, 인바운드 헤더 제거, 인앱, `getClaims` 횟수, 탈퇴)는 그대로 통과해야 한다.

### 5.3 통과 목록 동기화 (새 테스트)

파일시스템에서 읽어 대조한다.

- `git ls-files public` 의 모든 파일이 matcher 에서 제외되고 `isPassThroughPath` 가 참이다. 새 아이콘 세 개를 포함한다.
- `app/api/**/route.ts` 의 모든 경로가 matcher 에서 제외된다. 동적 세그먼트(`[id]`)는 `x` 로 바꿔 넣는다.
- `app/(bare)/**/page.tsx` 의 경로는 통과 목록에 있거나 리다이렉트 스텁 네 개(`/vote`, `/vote/x`, `/mypage`, `/concert2025`) 중 하나다. `[provider]` 는 `google` 로 바꿔 넣는다.
- `app/` 바로 아래의 route handler 와 메타데이터 라우트(`open-in-browser/route.ts`, `sitemap.ts`)의 경로가 통과한다.
- next.config `rewrites()` 의 source 가 통과한다. `/supabase-proxy/x` 는 통과 목록으로, `/ko/supabase-proxy/x` 는 정규 언어로 통과한다.
- 이름이 비슷한 없는 경로(`/api`, `/apiary`, `/favicon.ico/vote`, `/sitemap-1.xml/x`, `/sitemap-foo.xml`, `/manifest.jsonx`, `/favicon.icox`, `/images`, `/locales`)는 middleware 가 실행된다.
- `app/[lang]` 아래 페이지의 URL 첫 세그먼트(라우트 그룹 괄호를 벗긴 것: `login`, `vote`, `rewards`, `faq` …) 가운데 언어 태그 모양인 것이 없다.
- `AUTH_CALLBACK_PATH` 에 맞는 경로는 모두 `isPassThroughPath` 가 참이다(규칙 2 의 목적지가 통과로 끝나는 조건).

### 5.4 그 밖의 단위 테스트

- `__tests__/app/lang-layout-html.test.tsx`: `ZH-TW`, `xx`, `login`, `"><script>` 의 단언을 `notFound` 호출로 바꾼다. 12개 언어의 `<html lang>` 은 그대로다.
- `__tests__/middleware/matcher.test.ts`: 좁힌 패턴의 제외·실행 사례를 더한다. 인앱 동치 테스트의 `/concert2025`, `/vote/sitemap.xml` 은 이제 언어 규칙 때문에 307 이 되므로 `/en/concert2025`, `/en/vote/sitemap.xml` 로 바꿔 인앱 판정을 계속 확인한다.
- `__tests__/next-config-redirects.test.ts`: 개인정보 두 항목이 있고 `permanent: true` 가 하나도 없다.
- `__tests__/app/unprefixed-redirect-stubs.test.tsx`: 동작 단언은 그대로 두고 설명만 고친다.
- referrer 정책: `DEFAULT_METADATA.referrer` 가 같은 출처에 전체 주소를 보내는 값(`origin-when-cross-origin`, `strict-origin-when-cross-origin`, `no-referrer-when-downgrade`, `same-origin`, `unsafe-url` 중 하나)인지 단언한다.

### 5.5 로컬 통합 확인

워크트리에서 `npm ci` 뒤 `npm run build`, `next start` 로 확인한다. `SENTRY_DSN= NEXT_PUBLIC_SENTRY_DSN=` 로 DSN 을 비운다(로컬 실행도 운영 Sentry 에 보고한다). 기준선은 같은 방법으로 돌린 `a1eedad6` 의 응답이다.

| 요청 | 기대 |
|---|---|
| §2 표의 "변경 후" 열 전부 | 같은 상태와 Location. `/en/wp-admin` 은 로컬에서 404 |
| `/xx/rewards`, `/wp-admin`, `/login/vote` 의 목적지 | 404 이고 `x-nextjs-cache: HIT`(정적 404) |
| `/sitemap-1.xml`, `/images/rewards` | 404(가드) |
| `/%E0%A4%A/vote`(원시 HTTP 요청) | 기준선과 같음 |
| `/login` 에 `Cookie: locale=ja`, `Accept-Language: ko-KR`, `Referer: http://<같은 호스트>/th/vote` 를 하나씩 | `/ja/login`, `/ko/login`, `/th/login` |
| `/auth/callback`, `/auth/loading`, `/ads/shortform/player`, `/open-in-browser`, `/sitemap.xml`, `/ko/sitemap.xml`, `/robots.txt`, `/api/banners`, `/images/logo.webp` | 기준선과 같음 |
| `/ko/rewards`, `/en/faq`, `/ko/vote`, `/ko/no/such/page` | 기준선과 같음 |

브라우저(Playwright)로는 `/th/vote` 에서 `router.push('/vote/:id')` 와 `window.location.href = '/vote/:id'` 가 `/th/vote/:id` 로 도착하는지, `/login?error=auth_code_missing` 이 오류 안내를 띄우는지 본다. 접속 호스트를 하나로 고정한다(`127.0.0.1` 과 `localhost` 를 섞으면 Referer 의 호스트가 달라진다).

대소문자 변형은 로컬과 Vercel 이 다르게 처리한다. 로컬의 next.config 리다이렉트는 대소문자를 무시하지만 Vercel 은 구분한다(`/KO` 실측). 최종 도착지는 같다.

자동으로 확인하지 못하는 것은 로그인 상태의 흐름이다(세션 쿠키가 있는 접두어 없는 요청, OAuth 콜백 성공 뒤의 이동). 머지 뒤 실제 계정으로 확인한다.

## 6. 배포와 운영

### 6.1 PR 구성

- 이 설계의 변경은 PR 하나다: `lib/i18n/locale-routing.ts`, `middleware.ts`, `app/[lang]/layout.tsx`, `next.config.js`, `public/` 아이콘 세 개, 테스트, 문서.
- 쿠키 버그 수정(§7)은 별도의 작은 PR 이다. Referer 신호(§4.2 의 1번)가 있으면 순서는 상관없다. 사이트 안의 이동이 쿠키와 무관하게 맞기 때문이다. Referer 신호를 빼기로 하면 쿠키 PR 을 먼저 머지한다(§9).
- middleware 는 인증 세션을 다루므로 고위험으로 분류한다. 구현과 다른 공급자(Codex gpt-6-sol high)가 교차 리뷰한다.

### 6.2 머지 전후 확인

Preview 배포가 없다. 머지 직전에 Production 기준선을 찍고, 배포가 READY 가 된 뒤 같은 요청을 다시 보내 §2 표의 "변경 후" 열과 대조한다.

- 기존 점검(ISR HIT, 동적 MISS, `<html lang>`, sitemap 수)은 머지 전과 같아야 한다.
- 기존 점검 가운데 의도대로 바뀌는 줄: 인앱 UA 의 `/vote/123` 이 `/open-in-browser?returnTo=%2Fvote%2F123` 에서 `/ko/vote/123` 으로 바뀐다. `/vote`, `/vote/295`, `/mypage`, `/concert2025` 의 Location 은 그대로지만 응답하는 곳이 스텁 페이지에서 middleware 로 바뀐다.
- 신호 확인 세 줄: `/login` 에 `Cookie: locale=ja`, `Accept-Language: ko-KR`, `Referer: https://www.picnic.fan/th/vote` 를 하나씩 붙여 `/ja/login`, `/ko/login`, `/th/login` 을 본다.
- 307 의 `cache-control` 이 `private, no-store` 인지 본다. Vercel 의 middleware 307 기본값은 `public, max-age=0, must-revalidate` 다.
- 통과 목록: `/auth/callback`, `/auth/loading`, `/ads/shortform/player`, `/open-in-browser`, `/supabase-proxy/auth/v1/health`, `/sitemap.xml`, `/sitemap-0.xml`, `/ko/sitemap.xml`, `/robots.txt`, `/manifest.json`, `/firebase-messaging-sw.js`, `/_vercel/insights/script.js`, `/api/banners`.
- 연쇄: `/auth/callback/google/x` 와 `https://picnic.fan/download.html` 을 끝까지 따라가 이동 횟수를 센다(한 번, 세 번).
- 클라이언트 내비게이션: Production 의 `/ko/vote` 에서 `router.push('/rewards')` 가 `/ko/rewards` 에 도착하는지(§8 의 남은 가정).
- 5xx, error 로그, Sentry 신규 이슈. Sentry 는 Production 이벤트만 센다(`os.name` 이 macOS 인 것은 로컬 실행이다).

### 6.3 롤백

- 수단: Vercel Instant Rollback. 새 리다이렉트가 전부 307 이고 브라우저에 남는 것이 없다. `public/` 아이콘은 롤백돼도 해가 없다. Instant Rollback 뒤 후속 배포가 Production 도메인에 자동으로 붙는지는 `2026-09-30-root-layout-isr-design.md` 의 롤백 절에 적은 주의를 따른다.
- 즉시 롤백하는 신호
  - 통과 목록의 경로가 307 이나 404 가 된다(§6.2 의 확인).
  - 통과 목록 누락: 새 배포의 런타임 로그에 `/{언어}/auth/loading`, `/{언어}/ads/shortform/player`, `/{언어}/api/…` 의 404 가 나타난다. `/{언어}/auth/foo` 같은 없는 경로의 404 는 설계가 만드는 정상 응답이다.
  - 같은 경로의 307 이 반복된다(연쇄가 끝나지 않는다는 뜻).
  - `/api/auth/exchange-code`·`/api/auth/callback` 의 4xx·5xx 비율이 머지 직전 기준선보다 뚜렷이 늘어난다.
  - 정규 언어 경로의 5xx 가 늘어난다.
- 조회: Vercel 런타임 로그를 새 배포 id 로 좁혀 `statusCode` 와 `requestPath` 로 묶는다.

### 6.4 지표

런타임 로그 보존이 약 하루다. 머지 직전과 24시간 뒤에 같은 조건으로 두 번 잰다. "지금" 열은 2026-10-01 의 값이다.

| 지표 | 조회 | 지금 | 기대 |
|---|---|---|---|
| error 로그의 `/download/vote` | 런타임 로그, Production, level error, `requestPath` 로 묶음, 24시간 | 67건 | 0 |
| error 로그의 `/favicon.ico/vote`, `/login/vote`, `/apple-touch-icon.png/vote` | 같음 | 17, 9, 4건 | 0 |
| 남는 구멍의 요청 | 같은 조회에서 첫 세그먼트가 `images`·`api`·`locales`·`favicon`·`_next`·`_vercel`·`.well-known` 인 경로 | 조사용 요청뿐 | 늘지 않음 |
| 과거 버그 주소의 404 | 런타임 로그, `statusCode` 404, `requestPath` 로 묶음에서 `/{언어}/download/vote`, `/{언어}/login/vote` | 없음(지금은 200) | 하루 20건을 넘게 남으면 복구 규칙을 넣는다(§7) |
| `/favicon.ico` | curl | 307 | 200 |

### 6.5 리스크

| 리스크 | 완화 |
|---|---|
| 통과 목록에서 빠진 실제 경로가 `/{언어}/…` 로 가서 404 | 파일시스템 기반 동기화 테스트(§5.3). `/api/**` 는 matcher 가 전부 제외. 머지 직후 통과 목록 확인과 §6.3 의 404 신호. 307 이라 롤백이 깨끗 |
| 리다이렉트 연쇄가 끝나지 않는다 | 규칙 2 와 통과 목록이 같은 정규식을 쓴다. 연쇄 단위 테스트(§5.1) |
| 스캐너가 리다이렉트를 따라오면 middleware 가 두 번 돈다 | 지금은 `/wp-admin` 이 307 뒤 `/wp-admin/vote` 에서 투표 목록을 서버 렌더한다. 새 방식은 307 뒤 정적 404 다. 봇 경로는 하루 수십 건 규모다 |
| 영어를 고른 비영어 기기 사용자가 밖에서 접두어 없는 주소로 들어오면 기기 언어로 간다 | 쿠키가 기기 언어로 되돌아가는 기존 버그 때문이다. 별도 PR 로 고친다(§7). 사이트 안의 이동은 Referer 로 맞는다 |
| Referer 가 없는 환경(프라이버시 도구, 일부 인앱 웹뷰) | 쿠키, 브라우저 언어 순서로 떨어진다. 승인된 기본값과 같은 결과다 |
| 레이아웃 가드의 404 가 캐시 항목이 되고 페이지 코드가 실행된다 | §4.5. 조작된 요청에서만 생긴다. §6.4 의 지표로 본다 |
| 과거 버그가 만든 `/download/vote`, `/login/vote` 가 404 가 된다 | 자기 자신을 canonical 로 가진 중복 페이지라 404 가 맞다. 새로 만들어지지 않는다. §6.4 의 기준을 넘으면 복구 규칙을 넣는다 |
| matcher 의 새 패턴이 Vercel 에서 다르게 동작 | `$` 를 쓰는 기존 항목이 Production 에서 동작 중이다. 머지 직후 `/api` 307, `/sitemap-0.xml` 200, `/favicon.ico` 200 을 확인 |
| 인앱 브라우저에서 접두어 없는 주소의 이동이 한 번 늘어난다 | §4.8. 도착지가 맞는 주소가 되는 대가다. 줄이는 방법은 후속(§7) |
| 클라이언트 라우터가 접두어 없는 주소의 결과를 잠시 기억한다 | 정적 페이지로 가는 접두어 없는 이동을 한 뒤 5분 안에 언어를 바꾸고 같은 주소로 다시 이동하면 앞의 언어로 갈 수 있다. 그런 호출부는 지금 없다 |
| 언어 태그 모양의 오탐(나중에 `/qa` 같은 두 글자 페이지가 생길 때) | 모양에 맞아도 지원 언어가 아니면 일반 경로로 취급하므로 `/qa` 는 `/{언어}/qa` 로 간다. `app/[lang]` 아래에 언어 모양 세그먼트가 생기면 실패하는 테스트를 둔다 |

## 7. 범위 밖·후속

- **쿠키 버그**: `components/providers/LanguageSyncProvider.tsx` 가 저장된 언어가 기본값 `en` 이면 저장값이 없는 것으로 취급해 기기 언어로 쿠키를 덮어쓴다. 조건을 "저장값이 없을 때"로 줄이는 작은 PR.
- **홈 `/` 의 선호 언어 전환**: 이 변경의 지표를 본 뒤 한 줄짜리 PR.
- **잘못된 id 와 남는 구멍**: `/ko/rewards/<없는 id>` 의 soft 404, §4.5 의 가드 404, `/images/sitemap.xml` 을 함께 다룬다. sitemap 은 route handler 로 바꿔 언어를 검사할 수 있다.
- 접두어 없는 주소를 만드는 호출부(`VoteCard`, `VoteListPresenter`, `RetryButton`)를 언어 경로로 고치기.
- 인앱 브라우저에서 접두어 없는 주소의 이동 횟수 줄이기.
- `(bare)` 리다이렉트 스텁과 `rendering-modes` 표의 스텁 항목 삭제.
- 과거 버그 주소 `/<경로>/vote` 의 복구 규칙(§6.4 의 기준).
- `/open-in-browser` 의 308 을 307 로, 언어 결정을 공용 함수로.
- 클라이언트 언어 판별 통합, `normalizeRedirectPath` 의 이중 접두어.
- 약관·개인정보의 `/contact` 링크(목적지 결정 필요), PayPal `return_url`, `/auth/auth-code-error`.
- 표기 변형 정규화의 308 승격(안정화 뒤).
- `/supabase-proxy` rewrite 와 `/emergency-auth-fix.js` 의 정리(사용처 0건).

## 8. 확인한 사실과 남은 가정

확인한 사실

| 사실 | 방법 |
|---|---|
| §2 의 "지금" 열 | 2026-10-01 Production GET. 잘못된 percent-encoding 은 원시 HTTP/1.1 요청으로 400 을 확인(curl 은 HTTP/2 프로토콜 오류로 끝난다) |
| 정규 언어 아래 없는 경로는 정적 404 다(`/en/xx/rewards`, `/en/login/vote`, `/en/contact`). `/en/wp-admin` 은 Vercel 이 403 | 같음 |
| Vercel 은 `/_vercel/<임의 경로>` 를 가로채지 않는다(`/_vercel/rewards` 가 `[lang]` 으로 렌더). `/_vercel/insights/script.js` 는 플랫폼이 준다 | 같음 |
| apex `picnic.fan` 은 307 로 www 에 보낸다 | 같음 |
| Vercel 에서 middleware 는 ISR 캐시보다 먼저 실행된다 | 2026-10-01 Production: ISR 페이지 `/en/faq` 를 인앱 UA 로 요청하면 307 |
| Vercel 의 next.config 리다이렉트는 대소문자를 구분한다(`/KO` 가 언어 루트 규칙에 맞지 않음) | 2026-09-30, 2026-10-01 Production |
| 24시간 error 로그 건수(§2, §6.4) | 2026-10-01 Vercel 런타임 로그(Production, level error, `requestPath` 로 묶음) |
| middleware 의 307 뒤 목적지가 정상으로 렌더되고 쿼리가 보존된다. POST 도 307 이다 | 버리는 프로브 빌드(`next start`, Next 15.5.26) |
| 클라이언트 내비게이션(`router.push`)의 RSC 요청이 middleware 의 307 을 따라가고, 주소와 `<html lang>` 이 목적지로 바뀐다. 목적지 요청에는 `_rsc` 쿼리가 없고 `RSC` 헤더가 남는다 | 같음(Playwright) |
| RSC 요청과 `window.location.href` 이동에 `Referer` 가 전체 주소로 실린다. `/th/vote` 에서 `/vote/304` 로 가면 `/th/vote/304` 에 도착한다 | 같음(프로브 middleware 에 Referer 규칙을 넣어 확인) |
| 로컬 `next start` 에서 `req.nextUrl.origin` 은 `http://localhost:포트` 이고 `Host` 헤더는 접속한 호스트다 | 같음 |
| 레이아웃 가드의 동작(§4.5) | 같음. Next 15.5.23 에서도 같은 결과 |
| 새 matcher 의 제외·실행 목록(§4.4) | Next 15.5.26 의 `unstable_doesMiddlewareMatch` |
| 규칙의 출력과 연쇄(§4.1, §5). 표본 주소 99개가 모두 세 번 안에 통과로 끝난다 | 스크래치 시뮬레이션 |
| `public/` 에 확장자 없는 파일이 없고 루트에 `favicon.ico` 가 없다 | `ls`, `find` |
| 형제 저장소(앱, 어드민, supabase)에 `/supabase-proxy`, `/ads/shortform/player`, `/auth/loading`, `/open-in-browser` 사용처가 없다. 앱은 `/download.html` 을 www 와 apex 로 연다 | 2026-09-30, 2026-10-01 grep |

남은 가정과 틀렸을 때의 대응

| 가정 | 틀렸을 때 |
|---|---|
| Vercel 에서도 RSC 요청이 307 을 따라간 뒤 RSC 응답을 받는다(응답에 `Vary: RSC` 가 있고 Vercel 이 `RSC` 헤더로 `.rsc` 를 가른다) | Next 는 RSC 가 아닌 응답을 받으면 전체 페이지 이동으로 바꾼다. 도착지는 같다. 머지 직후 확인한다 |
| Vercel 이 middleware 가 붙인 `Cache-Control: private, no-store` 를 307 에 그대로 내보낸다 | 기본값(`public, max-age=0, must-revalidate`)이어도 브라우저가 저장하지 않는다. 머지 직후 확인한다 |
| Vercel 에서 레이아웃 가드의 404 가 로컬과 같게 나온다 | 가드를 빼도 middleware 규칙은 그대로 동작한다. 남는 구멍만 지금처럼 200 이 된다 |
| Production 의 `Host` 헤더가 공개 호스트(`www.picnic.fan`)다 | 다르면 Referer 신호가 맞지 않아 쿠키로 떨어진다. 머지 직후 §6.2 의 신호 확인으로 드러난다 |
| Apple·Google·Kakao 콘솔에 언어가 붙은 콜백 주소가 등록돼 있지 않다 | 있어도 규칙 2 가 언어를 떼 준다. POST 콜백도 307 이라 메서드가 유지된다 |
| App Store 에 등록된 개인정보 주소가 `/privacy_en.html` 과 같거나 정상 주소다 | 다른 옛 주소면 next.config 에 한 줄을 더한다 |
| `fil`, `jp` 별칭이 실제 요청에 있다 | 없어도 해가 없다 |

## 9. 결정 사항

승인된 기본값(2026-10-01)

- 방향은 1안이다.
- 선호 언어는 쿠키, 브라우저 언어, 영어 순서다.
- 홈 `/` 는 이번에 그대로 둔다.
- 미지원 언어 주소(`/fr/vote`)는 선호 언어를 붙인 307 뒤 정적 404 로 끝난다.
- 옛 `.html` 주소는 `privacy_en`, `privacy_ko` 둘만 살린다.
- 쿠키 버그는 별도 PR 이다.
- 새 리다이렉트는 전부 307 이다.

확인이 필요한 것

1. **선호 언어의 첫 신호로 Referer 를 더한다.** 승인된 순서 앞에 "같은 사이트의 직전 페이지 언어"를 뒀다(§4.2). 없으면 사이트 안의 접두어 없는 이동이 보던 언어와 다른 언어로 갈 수 있다. 빼기로 하면 §4.2 의 1번과 관련 테스트(§5.1, §5.2, §5.4 의 referrer 정책), §4.8 의 예, §6.2 의 신호 확인 한 줄을 지우고, 쿠키 PR 을 이 PR 보다 먼저 머지한다.
2. **남는 구멍을 받아들인다**(§4.5). 조작된 주소는 404 가 되지만 캐시 항목과 페이지 코드 실행이 남고, `/images/sitemap.xml` 류는 200 그대로다. 완전히 닫으려면 matcher 에 라우트 모양 목록을 넣어야 한다.
3. **인앱 브라우저에서 접두어 없는 주소의 이동이 한 번 늘어난다**(§4.8).
4. 외부에 등록된 주소 가운데 이 문서에 없는 것이 있으면 알려 달라. App Store 의 개인정보 주소, OAuth 콘솔의 콜백 주소가 해당한다.
