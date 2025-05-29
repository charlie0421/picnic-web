import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from '@/config/settings';

/**
 * 루트 페이지 - 적절한 언어로 리다이렉트
 * 
 * 사용자의 브라우저 언어 설정을 확인하고 지원되는 언어로 리다이렉트합니다.
 * 지원되지 않는 언어인 경우 기본 언어(한국어)로 리다이렉트합니다.
 */
export default async function RootPage() {
  const headersList = await headers();
  const acceptLanguage = headersList.get('accept-language') || '';
  
  // 브라우저 언어 설정에서 선호 언어 추출
  const preferredLanguage = acceptLanguage
    .split(',')
    .map(lang => lang.split(';')[0].trim().toLowerCase())
    .find(lang => {
      // 정확한 매치 확인 (예: 'ko', 'en')
      if (SUPPORTED_LANGUAGES.includes(lang as any)) {
        return true;
      }
      // 언어 코드만 확인 (예: 'ko-KR' -> 'ko')
      const langCode = lang.split('-')[0];
      return SUPPORTED_LANGUAGES.includes(langCode as any);
    });

  // 지원되는 언어로 리다이렉트
  const targetLanguage = preferredLanguage?.split('-')[0] || DEFAULT_LANGUAGE;
  
  redirect(`/${targetLanguage}`);
} 