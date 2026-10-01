import { NextRequest, NextResponse } from 'next/server';
import { type Language } from '@/config/settings';
import { classifyFirstSegment, resolvePreferredLanguage } from '@/lib/i18n/locale-routing';

// 정적 라우트라 lang segment 를 못 가지므로, returnTo path 의 언어 또는 요청의 언어 신호로
// 사용자 lang 을 결정해서 /[lang]/open-in-browser 로 다시 redirect 한다.
// (그쪽 페이지가 ko/en 다국어 + iOS/Android 분기를 처리.)

function resolveLang(req: NextRequest, returnTo: string): Language {
  // 1) returnTo path 의 첫 segment 가 언어(정규 언어 또는 표기 변형)이면 그것 사용.
  const first = returnTo.split(/[?#]/)[0].split('/')[1] ?? '';
  const segment = classifyFirstSegment(first);
  if (segment.kind === 'canonical' || segment.kind === 'variant') return segment.lang;

  // 2) 아니면 middleware 와 같은 순서로 정한다(같은 호스트 Referer → locale 쿠키 → Accept-Language → 기본 언어).
  return resolvePreferredLanguage({
    referer: req.headers.get('referer'),
    host: req.headers.get('host'),
    cookieLocale: req.cookies.get('locale')?.value ?? null,
    acceptLanguage: req.headers.get('accept-language'),
  });
}

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('returnTo') || '/';
  const safeReturn = raw.startsWith('/') ? raw : `/${raw}`;
  const lang = resolveLang(req, safeReturn);

  const dest = new URL(`/${lang}/open-in-browser`, req.nextUrl.origin);
  dest.searchParams.set('returnTo', safeReturn);
  // 307: 영구 리다이렉트는 브라우저에 남아 롤백으로 되돌릴 수 없다. 응답이 쿠키와 Accept-Language 에 따라 달라진다.
  const redirect = NextResponse.redirect(dest, 307);
  redirect.headers.set('Cache-Control', 'private, no-store');
  return redirect;
}
