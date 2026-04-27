import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, type Language } from '@/config/settings';

// 정적 라우트라 lang segment 를 못 가지므로, returnTo path 또는 Accept-Language
// 헤더로 사용자 lang 을 결정해서 /[lang]/open-in-browser 로 다시 redirect 한다.
// (그쪽 페이지가 ko/en 다국어 + iOS/Android 분기를 처리.)

function isSupported(code: string): code is Language {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code);
}

function resolveLang(returnTo: string, acceptLanguage: string | null): Language {
  // 1) returnTo path 의 첫 segment 가 supported lang 이면 그것 사용.
  const m = returnTo.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i);
  if (m) {
    const candidate = m[1].toLowerCase();
    if (isSupported(candidate)) return candidate;
  }
  // 2) Accept-Language 헤더에서 우선순위 따라 매칭.
  if (acceptLanguage) {
    const tokens = acceptLanguage
      .split(',')
      .map((entry) => {
        const [code, q] = entry.trim().split(';q=');
        return { code: code.replace('_', '-').toLowerCase(), q: q ? parseFloat(q) : 1.0 };
      })
      .sort((a, b) => b.q - a.q);
    for (const { code } of tokens) {
      if (isSupported(code)) return code;
      const primary = code.split('-')[0];
      if (isSupported(primary)) return primary;
    }
  }
  return DEFAULT_LANGUAGE as Language;
}

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('returnTo') || '/';
  const safeReturn = raw.startsWith('/') ? raw : `/${raw}`;
  const lang = resolveLang(safeReturn, req.headers.get('accept-language'));

  const dest = new URL(`/${lang}/open-in-browser`, req.nextUrl.origin);
  dest.searchParams.set('returnTo', safeReturn);
  return NextResponse.redirect(dest, 308);
}
