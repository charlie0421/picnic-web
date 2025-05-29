import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import createIntlMiddleware from 'next-intl/middleware';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";

// next-intl 미들웨어 생성
const intlMiddleware = createIntlMiddleware({
  locales: SUPPORTED_LANGUAGES,
  defaultLocale: DEFAULT_LANGUAGE,
  localePrefix: 'always',
  localeDetection: true // 브라우저 언어 감지 활성화
});

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // applink.picnic.fan/vote/detail/ 경로를 vote/로 리다이렉트
  if (pathname.includes("/vote/detail/")) {
    const voteId = pathname.split("/").pop();
    console.log("voteId", voteId);
    return NextResponse.redirect(new URL(`/vote/${voteId}`, request.url));
  }

  // 정적 파일 및 API 경로는 건너뛰기
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/static/") ||
    pathname.includes(".") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/robots") ||
    pathname.startsWith("/sitemap")
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

  // 잘못된 언어 코드 처리 (예: /kr -> /ko)
  const pathSegments = pathname.split('/');
  const firstSegment = pathSegments[1];
  
  if (firstSegment && !SUPPORTED_LANGUAGES.includes(firstSegment as any)) {
    // 일반적인 언어 코드 매핑
    const languageMapping: Record<string, string> = {
      'kr': 'ko',
      'cn': 'zh',
      'jp': 'ja',
      'in': 'id'
    };
    
    if (languageMapping[firstSegment]) {
      const newPathname = pathname.replace(`/${firstSegment}`, `/${languageMapping[firstSegment]}`);
      console.log(`언어 코드 수정 리다이렉트: ${pathname} -> ${newPathname}`);
      return NextResponse.redirect(new URL(newPathname, request.url));
    }
  }

  // next-intl 미들웨어 실행
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
