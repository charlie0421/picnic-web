import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';

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

  // In-app browser (KakaoTalk on Android) hard redirect to open-in-browser interstitial
  try {
    const ua = req.headers.get('user-agent') || '';
    const url = new URL(req.url);
    const pathname = url.pathname;

    const isKakao = /KAKAOTALK/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    const isAlreadyOpenPage = /\/open-in-browser(\/|$)/.test(pathname);
    const isApi = pathname.startsWith('/api/');
    const isStatic = pathname.startsWith('/_next') || pathname === '/favicon.ico';
    const isAuthCallback = pathname.startsWith('/auth/callback');

    if (isKakao && isAndroid && !isAlreadyOpenPage && !isApi && !isStatic) {
      const lang = getPreferredLanguage(req);
      const returnTo = `${pathname}${url.search}` || '/';
      const target = new URL(`/${lang}/open-in-browser`, url.origin);
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
    await supabase.auth.getUser();
  } catch (_) {
    // Ignore auth errors in middleware
  }

  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
