import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/settings";

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
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // auth/callback 경로는 언어 경로 추가 없이 직접 처리
  // /auth/callback/[provider] 형태로 동적 라우트 사용
  if (pathname.startsWith("/auth/callback/")) {
    console.log(`✅ auth/callback 경로 직접 처리: ${pathname}`);
    return NextResponse.next();
  }

  // 언어 경로가 포함된 auth/callback 처리 (Apple Developer Console 호환성)
  // /en/auth/callback/apple -> /auth/callback/apple로 리다이렉트
  for (const lang of SUPPORTED_LANGUAGES) {
    if (pathname.startsWith(`/${lang}/auth/callback/`)) {
      const newPathname = pathname.replace(`/${lang}`, "");
      const newUrl = new URL(request.url);
      newUrl.pathname = newPathname;
      console.log(`언어 경로 제거 리다이렉트: ${pathname} -> ${newPathname}`);
      return NextResponse.redirect(newUrl);
    }
  }

  // 이미 언어가 포함된 경로인지 확인
  const pathnameHasLang = SUPPORTED_LANGUAGES.some((lang) =>
    pathname.startsWith(`/${lang}/`) || pathname === `/${lang}`
  );

  if (pathnameHasLang) {
    return NextResponse.next();
  }

  // 쿠키에서 현재 언어 확인
  const currentLang = request.cookies.get("NEXT_LOCALE")?.value;
  const preferredLang = SUPPORTED_LANGUAGES.includes(currentLang as any)
    ? currentLang
    : DEFAULT_LANGUAGE;

  // 기본 언어로 리다이렉트
  const newUrl = new URL(request.url);
  newUrl.pathname = `/${preferredLang}${pathname}`;
  return NextResponse.redirect(newUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
