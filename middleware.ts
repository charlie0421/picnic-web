import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";

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

  console.log(`⚠️ 브라우저 언어에서 지원되는 언어 없음, 기본 언어 사용: ${DEFAULT_LANGUAGE}`);
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // applink.picnic.fan/vote/detail/ 경로를 vote/로 리다이렉트
  if (pathname.includes("/vote/detail/")) {
    const voteId = pathname.split("/").pop();
    console.log("voteId", voteId);
    return NextResponse.redirect(new URL(`/vote/${voteId}`, request.url));
  }

  // /download 경로에 대한 특별 처리
  if (pathname === "/download" || pathname === "/download.html") {
    const preferredLang = getPreferredLanguage(request);
    console.log(`🔄 Download 페이지 리다이렉트: ${pathname} -> /${preferredLang}/download`);
    
    const newUrl = new URL(request.url);
    newUrl.pathname = `/${preferredLang}/download`;
    
    const response = NextResponse.redirect(newUrl);
    response.cookies.set("locale", preferredLang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax"
    });
    
    return response;
  }

  // 정적 파일, API 경로, 투표 상세 페이지는 건너뛰기
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/static/") ||
    pathname.includes(".") ||
    // 투표 상세 페이지는 정적 렌더링을 위해 middleware 스킵
    /^\/[a-z]{2}\/vote\/\d+$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // auth/callback 경로는 언어 경로 추가 없이 직접 처리
  // /auth/callback 또는 /auth/callback/[provider] 형태로 동적 라우트 사용
  if (pathname.startsWith("/auth/callback")) {
    console.log(`✅ auth/callback 경로 직접 처리: ${pathname}`);
    return NextResponse.next();
  }

  // auth 관련 경로 전체를 언어 리다이렉트에서 제외
  if (pathname.startsWith("/auth/")) {
    console.log(`✅ auth 경로 직접 처리: ${pathname}`);
    return NextResponse.next();
  }

  // 언어 경로가 포함된 auth/callback 처리 (Apple Developer Console 호환성)
  // /en/auth/callback -> /auth/callback로 리다이렉트
  for (const lang of SUPPORTED_LANGUAGES) {
    if (pathname.startsWith(`/${lang}/auth/callback`)) {
      const newPathname = pathname.replace(`/${lang}`, "");
      const newUrl = new URL(request.url);
      newUrl.pathname = newPathname;
      console.log(`언어 경로 제거 리다이렉트: ${pathname} -> ${newPathname}`);
      return NextResponse.redirect(newUrl);
    }
  }

  // 경로에서 언어 코드 추출
  const pathLangCode = pathname.split('/')[1];
  
  // 지원하지 않는 언어 경로인지 확인 (예: /fr/, /de/ 등)
  if (pathLangCode && pathLangCode.length === 2 && !SUPPORTED_LANGUAGES.includes(pathLangCode as any)) {
    console.log(`❌ 지원하지 않는 언어 경로: ${pathLangCode} -> 영어로 리다이렉트`);
    const newUrl = new URL(request.url);
    newUrl.pathname = pathname.replace(`/${pathLangCode}`, `/en`);
    
    const response = NextResponse.redirect(newUrl);
    response.cookies.set("locale", "en", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax"
    });
    
    return response;
  }

  // 이미 지원되는 언어가 포함된 경로인지 확인
  const pathnameHasLang = SUPPORTED_LANGUAGES.some((lang) =>
    pathname.startsWith(`/${lang}/`) || pathname === `/${lang}`
  );

  if (pathnameHasLang) {
    // 언어가 포함된 경로에서 쿠키 업데이트
    const currentLangFromPath = pathname.split('/')[1];
    if (SUPPORTED_LANGUAGES.includes(currentLangFromPath as any)) {
      console.log(`✅ 지원되는 언어 경로: ${currentLangFromPath}`);
      const response = NextResponse.next();
      
      // useLocaleRouter와 일치하는 'locale' 쿠키 설정
      response.cookies.set("locale", currentLangFromPath, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1년
        sameSite: "lax"
      });
      
      return response;
    }
    return NextResponse.next();
  }

  // 선호 언어 결정
  const preferredLang = getPreferredLanguage(request);
  console.log(`🌐 선호 언어 결정: ${preferredLang} (지원 언어: ${SUPPORTED_LANGUAGES.join(', ')})`);

  // 모든 언어에 대해 명시적으로 언어 경로로 리다이렉트

  // 언어 경로로 리다이렉트
  const newUrl = new URL(request.url);
  newUrl.pathname = `/${preferredLang}${pathname}`;
  
  const response = NextResponse.redirect(newUrl);
  
  // 쿠키 설정
  response.cookies.set("locale", preferredLang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1년
    sameSite: "lax"
  });
  
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
