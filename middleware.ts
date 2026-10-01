import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { STATIC_ASSET_PATH, decideLocaleRoute } from './lib/i18n/locale-routing';

function isLoginPath(pathname: string): boolean {
  // /login, /ko/login, /en/login 등
  return /^\/([a-z]{2}(-[a-z]{2})?\/)?login(\/|$)/i.test(pathname);
}

// 경로 기반 요청 헤더는 middleware 만 만든다 — 클라이언트가 보낸 값은 버린다.
// - x-locale: 경로의 정규 언어. 레이아웃은 더 이상 읽지 않는다(<html lang> 은 [lang] 파라미터로 정한다).
//   서버 컴포넌트가 다시 읽으면 그 페이지는 동적 렌더링이 된다 — 제거는 후속 정리.
// - x-pathname / x-url: 더 이상 읽는 곳이 없다(VoteLite·경로 광고 분기 제거). 예전 코드나
//   서드파티가 신뢰하지 않도록 인바운드 값을 계속 지운다.
const ROUTING_REQUEST_HEADERS = ['x-locale', 'x-pathname', 'x-url'] as const;

function buildForwardedRequestHeaders(req: NextRequest, lang: string | null): Headers {
  const headers = new Headers(req.headers);
  for (const name of ROUTING_REQUEST_HEADERS) {
    headers.delete(name);
  }
  if (lang) {
    headers.set('x-locale', lang);
  }
  return headers;
}

export async function middleware(req: NextRequest) {
  // 언어 접두어 판정을 맨 앞에 둔다(인앱 안내·Supabase·getClaims 보다 먼저).
  // 리다이렉트는 Supabase 가 쿠키를 쓰기 전에 나가므로 옮길 쿠키가 없고, 세션 갱신과 탈퇴 차단은
  // 목적지 요청에서 middleware 가 다시 돌 때 적용된다. 규칙은 lib/i18n/locale-routing.ts 에 있다.
  const decision = decideLocaleRoute(req.nextUrl.pathname, {
    referer: req.headers.get('referer'),
    host: req.headers.get('host'),
    cookieLocale: req.cookies.get('locale')?.value ?? null,
    acceptLanguage: req.headers.get('accept-language'),
  });
  if (decision.type === 'redirect') {
    const url = req.nextUrl.clone();
    url.pathname = decision.pathname; // 쿼리는 그대로 남는다
    // 307: 메서드와 본문을 유지한다. 영구 리다이렉트를 쓰지 않아 롤백이 깨끗하다.
    const redirect = NextResponse.redirect(url, 307);
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }

  // Create a response that we can modify cookies on
  const res = NextResponse.next({
    request: { headers: buildForwardedRequestHeaders(req, decision.lang) },
  });

  // 인앱 브라우저 (KakaoTalk, Twitter/X, Facebook, Instagram, Line, NAVER) hard redirect.
  // 인앱은 DOM mutation, OAuth third-party cookie 차단, 결제 redirect 제약 등으로
  // 핵심 기능이 자주 깨진다. /open-in-browser interstitial 로 외부 브라우저 유도.
  try {
    const ua = req.headers.get('user-agent') || '';
    const url = new URL(req.url);
    const pathname = url.pathname;

    // SNS 미리보기/검색엔진 봇은 redirect 하지 않는다 (OGP, 인덱싱 영향).
    const isBot = /bot|crawler|spider|googlebot|bingbot|duckduckbot|yandexbot|baiduspider|facebookexternalhit|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|kakaobot|naverbot|yeti/i.test(ua);

    // 인앱 브라우저 식별. UA 패턴은 각 앱 공식 문서/실측 기준.
    // - KakaoTalk: "KAKAOTALK"
    // - Facebook: "FBAV", "FBAN", "FB_IAB" (in-app browser)
    // - Instagram: "Instagram"
    // - Twitter/X: "Twitter for iPhone/iPad", "TwitterAndroid", "Twitter Lite"
    // - Line: "Line/"
    // - NAVER: "NAVER(inapp" (네이버 앱)
    const isInApp = !isBot && /KAKAOTALK|FBAV|FBAN|FB_IAB|Instagram|Twitter for|TwitterAndroid|Twitter Lite|Line\/|NAVER\(inapp/i.test(ua);

    const isAlreadyOpenPage = /\/open-in-browser(\/|$)/.test(pathname);
    const isApi = pathname.startsWith('/api/');
    const isStatic = STATIC_ASSET_PATH.test(pathname);
    // OAuth callback 은 인앱에서도 통과시켜야 callback handler 가 동작
    const isAuthCallback = pathname.startsWith('/auth/callback');

    if (isInApp && !isAlreadyOpenPage && !isApi && !isStatic && !isAuthCallback) {
      const returnTo = `${pathname}${url.search}` || '/';
      const target = new URL(`/open-in-browser`, url.origin);
      target.searchParams.set('returnTo', returnTo);
      return NextResponse.redirect(target);
    }
  } catch (_) {}

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res;
  }

  // Create a Supabase client that reads/writes cookies via the middleware response
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          res.cookies.set({ name, value, ...options });
        } catch (_) {
          // Ignore set errors in middleware
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          res.cookies.set({ name, value: '', ...options });
        } catch (_) {
          // Ignore delete errors in middleware
        }
      },
    },
  });

  // 세션 갱신·검증은 getClaims 로 한다 — 만료 access token 은 refresh 하고(쿠키 갱신),
  // 비대칭 서명 키(ES256 JWKS)면 Auth 서버 왕복 없이 로컬에서 JWT 를 검증한다(HS 토큰은 SDK 가 getUser 로 폴백).
  // 매 요청 getUser() 호출을 없애되, 탈퇴 계정 방어 계층은 로그인 요청에 한해 유지한다(비로그인은 네트워크 0).
  try {
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;

    // 탈퇴(soft delete) 계정 방어계층 — 로그인 페이지가 아닌 경로에서만 차단 및 리다이렉트
    if (userId) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (!isLoginPath(pathname)) {
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('deleted_at')
            .eq('id', userId)
            .maybeSingle();

          if (profile?.deleted_at) {
            // 세션 즉시 종료
            try {
              await supabase.auth.signOut();
            } catch (_) {}

            const lang =
              decision.lang ||
              req.cookies.get('locale')?.value ||
              DEFAULT_LANGUAGE;
            const redirectLang = (SUPPORTED_LANGUAGES as readonly string[]).includes(lang)
              ? lang
              : DEFAULT_LANGUAGE;

            const redirectUrl = new URL(`/${redirectLang}/login`, url.origin);
            redirectUrl.searchParams.set('error', 'withdrawn');

            const blockRes = NextResponse.redirect(redirectUrl);
            // signOut 에서 cleared 된 쿠키들을 응답에 복사
            for (const cookie of res.cookies.getAll()) {
              blockRes.cookies.set({
                name: cookie.name,
                value: cookie.value,
                path: cookie.path,
                maxAge: cookie.maxAge,
                domain: cookie.domain,
                secure: cookie.secure,
                sameSite: cookie.sameSite,
                httpOnly: cookie.httpOnly,
              });
            }
            return blockRes;
          }
        } catch (_) {
          // 조회 실패 시 fail-open (기존 플로우 유지 — 콜백/프로필 API에서 2차 차단됨)
        }
      }
    }
  } catch (_) {
    // Ignore auth errors in middleware
  }

  return res;
}

export const config = {
  // 정적 공개 파일은 middleware 대상에서 제외한다(퍼블릭 우선 서빙).
  // - 루트의 파일은 정확한 이름으로 적는다(끝의 `$`). 이름의 앞부분만 보면 /api, /favicon.ico/vote,
  //   /sitemap-foo.xml 같은 없는 경로가 middleware 를 건너뛰어 [lang] 으로 샌다.
  // - sitemap-N.xml 은 next-sitemap 이 만드는 0–99 만 제외한다.
  // - public/ 자산 디렉터리(/images, /locales, /favicon, /concert2025/image·video)와 /api/ 는 통째로 제외한다.
  //   그 아래의 없는 경로는 app/<디렉터리>/[...slug]/route.ts 가 404 로 받는다.
  // - 확장자로 제외하지 않는다 — /ko/vote/295.json 처럼 확장자가 붙은 [lang] 경로도 페이지다.
  // - matcher 는 정적 분석 대상이라 상수를 참조할 수 없다. lib/i18n/locale-routing.ts 의 STATIC_ASSET_PATH 와
  //   같은 기준을 유지한다(동기화는 __tests__/middleware/pass-through-sync.test.ts).
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico$|apple-touch-icon(?:-precomposed)?\\.png$|robots\\.txt$|app-ads\\.txt$|ads\\.txt$|sitemap\\.xml$|sitemap-(?:0|[1-9]\\d?)\\.xml$|(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)/sitemap\\.xml$|manifest\\.json$|site\\.webmanifest$|apple-developer-domain-association\\.txt$|images/|locales/|favicon/|concert2025/(?:image|video)/|firebase-messaging-sw\\.js$|emergency-auth-fix\\.js$).*)",
  ],
};
