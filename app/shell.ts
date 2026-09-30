import type { Viewport } from 'next';
import { Inter } from 'next/font/google';

/**
 * <html> 을 렌더하는 레이아웃([lang], (bare))이 함께 쓰는 문서 뼈대 상수.
 * next/font 로더는 모듈 스코프에서 한 번만 호출해야 한다.
 */
export const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
});

export const ADSENSE_CLIENT_ID = 'ca-pub-1539304887624918';

/** AdSense 계정 확인용 메타 태그 (metadata.other). */
export const ADSENSE_META = { 'google-adsense-account': ADSENSE_CLIENT_ID } as const;

export const VIEWPORT: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};
