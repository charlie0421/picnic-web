import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';

function extractLangFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = path.match(/^\/([a-z]{2}(-[a-z]{2})?)(?=\/|$)/i);
  if (!match) return null;
  const candidate = match[1].toLowerCase();
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(candidate)
    ? candidate
    : null;
}

function isLoginPath(pathname: string): boolean {
  // /login, /ko/login, /en/login 등
  return /^\/([a-z]{2}(-[a-z]{2})?\/)?login(\/|$)/i.test(pathname);
}

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

export async function middleware(req: NextRequest) {
  // Create a response that we can modify cookies on
  const res = NextResponse.next({ request: { headers: req.headers } });

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
    // 정적 자산: Next 내부 정적 경로, 파비콘, 그리고 파일 확장자를 가진 퍼블릭 파일들(.txt, .xml, .json 등)
    const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
    const isStatic = pathname.startsWith('/_next') || pathname === '/favicon.ico' || hasFileExtension;
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

  // Touch the user to trigger refresh if needed (no-op if valid)
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // 탈퇴(soft delete) 계정 방어계층 — 로그인 페이지가 아닌 경로에서만 차단 및 리다이렉트
    if (user?.id) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      if (!isLoginPath(pathname)) {
        try {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('deleted_at')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.deleted_at) {
            // 세션 즉시 종료
            try {
              await supabase.auth.signOut();
            } catch (_) {}

            const lang =
              extractLangFromPath(pathname) ||
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
  // 정적 공개 파일들은 미들웨어 대상에서 제외 (퍼블릭 우선 서빙 보장)
  // - robots.txt, app-ads.txt, ads.txt, sitemap(xml), 매니페스트, 애플 도메인 검증, .well-known/* 등
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots\\.txt|app-ads\\.txt|ads\\.txt|sitemap\\.xml|sitemap-.*\\.xml|manifest\\.json|site\\.webmanifest|apple-developer-domain-association\\.txt|\\.well-known/.*).*)",
  ],
};
