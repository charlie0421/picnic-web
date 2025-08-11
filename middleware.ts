import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * 브라우저의 Accept-Language 헤더에서 선호 언어 추출
 */
function getPreferredLanguageFromHeader(acceptLanguage: string | null): string {
  if (!acceptLanguage) return DEFAULT_LANGUAGE;

  // Accept-Language 헤더 파싱 (예: "ko-KR,ko;q=0.9,en;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, qValue] = lang.trim().split(';q=');
      const langCode = code.split('-')[0]; // ko-KR -> ko
      const quality = qValue ? parseFloat(qValue) : 1.0;
      return { code: langCode, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  // 지원하는 언어 중에서 가장 선호도가 높은 언어 찾기
  for (const lang of languages) {
    if (SUPPORTED_LANGUAGES.includes(lang.code as any)) {
      console.log(`✅ 브라우저 언어에서 지원되는 언어 발견: ${lang.code}`);
      return lang.code;
    }
  }

  console.log(`⚠️ 브라우저 언어에서 지원되는 언어 없음, 영어로 대체: en`);
  return 'en';
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
