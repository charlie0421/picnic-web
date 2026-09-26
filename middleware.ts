import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function extractLangFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  // Next 는 동적 세그먼트를 디코드해 라우팅한다(/%65n/vote → lang=en). 첫 세그먼트만 같은 방식으로 디코드한다.
  const firstSegment = path.split('/')[1];
  if (!firstSegment) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(firstSegment);
  } catch {
    return null; // 잘못된 percent-encoding
  }
  const candidate = decoded.toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate)
    ? candidate
    : null;
}

// 정적 자산: Next 내부 경로, public/ 의 자산 디렉터리, 루트의 정확한 파일, 로케일 sitemap(app/[lang]/sitemap.ts)
// (config.matcher 제외 목록과 같은 기준). 확장자로 판정하지 않는다 — /ko/vote/295.json 처럼 확장자가 붙은
// 동적 HTML 경로도 페이지로 라우팅된다.
const STATIC_ASSET_PATH =
  /^\/(?:_next\/|\.well-known\/|images\/|locales\/|favicon\/|concert2025\/(?:image|video)\/|(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)\/sitemap\.xml$|(?:favicon\.ico|robots\.txt|ads\.txt|app-ads\.txt|sitemap(?:-[^/]+)?\.xml|manifest\.json|site\.webmanifest|apple-developer-domain-association\.txt|firebase-messaging-sw\.js|emergency-auth-fix\.js)$)/;


/**
 * 브라우저의 Accept-Language 헤더에서 선호 언어 추출
 */
function getPreferredLanguageFromHeader(acceptLanguage: string | null): string {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  // Accept-Language 예: "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
  const candidates = acceptLanguage
    .split(',')
    .map((entry) => {
      const [rawCode, qValue] = entry.trim().split(';q=');
      const quality = qValue ? parseFloat(qValue) : 1.0;
      // 코드 정규화: 소문자, '_' → '-', 공백 제거
      const code = rawCode.trim().replace('_', '-').toLowerCase();
      return { code, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  for (const { code } of candidates) {
    // 1) 완전 일치 (예: 'zh-tw')
    if (SUPPORTED_LANGUAGES.includes(code as any)) {
      return code;
    }
    // 2) 지역 분리 후 특수 매핑: zh-tw 지원
    const [primary, region] = code.split('-');
    if (region) {
      const normalized = `${primary}-${region}` as typeof SUPPORTED_LANGUAGES[number];
      if (SUPPORTED_LANGUAGES.includes(normalized as any)) {
        return normalized;
      }
    }
    // 3) 기본 언어만 매칭 (예: es-ES → es)
    if (SUPPORTED_LANGUAGES.includes(primary as any)) {
      return primary;
    }
  }

  return DEFAULT_LANGUAGE;
}

/**
 * 요청에서 선호 언어 결정 (우선순위: 쿠키 > Accept-Language > 기본값)
 */
function getPreferredLanguage(request: NextRequest): string {
  // 1. 쿠키에서 언어 확인 (useLocaleRouter와 일치하는 'locale' 쿠키 사용)
  const cookieLocale = request.cookies.get("locale")?.value;
  if (cookieLocale && SUPPORTED_LANGUAGES.includes(cookieLocale as any)) {
    return cookieLocale;
  }

  // 2. 기존 NEXT_LOCALE 쿠키도 확인 (하위 호환성)
  const legacyCookieLocale = request.cookies.get("NEXT_LOCALE")?.value;
  if (legacyCookieLocale && SUPPORTED_LANGUAGES.includes(legacyCookieLocale as any)) {
    return legacyCookieLocale;
  }

  // 3. Accept-Language 헤더에서 언어 추출
  const acceptLanguage = request.headers.get("accept-language");
  return getPreferredLanguageFromHeader(acceptLanguage);
}

// 경로 기반 요청 헤더는 middleware 만 만든다 — 클라이언트가 보낸 값은 버린다.
// - x-locale: 경로의 지원 로케일. app/layout.tsx 의 <html lang>, 배너 링크 언어가 읽는다.
// - x-pathname / x-url: 레이아웃의 VoteLite·광고 분기 입력. 분기 활성화는 별도 결정이라
//   아직 주입하지 않고, 위조 헤더로 켜지지 않도록 지우기만 한다.
const ROUTING_REQUEST_HEADERS = ['x-locale', 'x-pathname', 'x-url'] as const;

function buildForwardedRequestHeaders(req: NextRequest): Headers {
  const headers = new Headers(req.headers);
  for (const name of ROUTING_REQUEST_HEADERS) {
    headers.delete(name);
  }
  const locale = extractLangFromPath(req.nextUrl.pathname);
  if (locale) {
    headers.set('x-locale', locale);
  }
  return headers;
}

export async function middleware(req: NextRequest) {
  // Create a response that we can modify cookies on
  const res = NextResponse.next({ request: { headers: buildForwardedRequestHeaders(req) } });

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

  // 세션 갱신·검증은 getClaims 로 한다 — 만료된 access token 은 refresh 하고(쿠키 갱신),
  // 비대칭 서명 키(JWKS)면 Auth 서버 왕복 없이 로컬에서 JWT 를 검증한다.
  // 매 요청 getUser()(Auth 서버 호출)와 user_profiles 조회는 하지 않는다(결정 #10, PERF-06).
  // 탈퇴 계정 차단은 로그인 콜백과 민감 API(투표·결제·업로드·스토리지·QNA)의 isWithdrawnUser 가 맡는다.
  try {
    await supabase.auth.getClaims();
  } catch (_) {
    // Ignore auth errors in middleware
  }

  return res;
}

export const config = {
  // 정적 공개 파일들은 미들웨어 대상에서 제외 (퍼블릭 우선 서빙 보장)
  // - robots.txt, app-ads.txt, ads.txt, sitemap(xml), 매니페스트, 애플 도메인 검증, .well-known/* 등
  // - public/ 자산 디렉터리(/images, /locales, /favicon, /concert2025/image·video)와 루트 서비스 워커·스크립트:
  //   세션 갱신·프로필 조회가 필요 없다. 확장자로 제외하지 않는다 — [lang] 아래 동적 경로는
  //   /ko/vote/295.json 처럼 확장자가 붙어도 페이지이므로 인앱 redirect·탈퇴 차단·x-locale 주입을 거쳐야 한다.
  //   STATIC_ASSET_PATH 와 같은 기준을 유지한다.
  // - 로케일 sitemap(/{locale}/sitemap.xml, app/[lang]/sitemap.ts): 크롤러용 XML 이라 세션·인앱 redirect 가 필요 없다.
  //   matcher 는 정적 분석 대상이라 SUPPORTED_LANGUAGES 를 참조할 수 없어 로케일을 나열한다 (동기화는 테스트가 검증).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots\\.txt|app-ads\\.txt|ads\\.txt|sitemap\\.xml|sitemap-.*\\.xml|(?:en|ko|zh-cn|zh-tw|ja|id|es|bn|tl|th|vi|my)/sitemap\\.xml$|manifest\\.json|site\\.webmanifest|apple-developer-domain-association\\.txt|\\.well-known/.*|images/|locales/|favicon/|concert2025/(?:image|video)/|firebase-messaging-sw\\.js$|emergency-auth-fix\\.js$).*)",
  ],
};
