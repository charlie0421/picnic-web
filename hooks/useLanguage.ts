import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { formatDateWithTimeZone } from '@/utils/date';
import type { SupportedLanguage } from '@/types/mypage-common';

export function useLanguage() {
  const pathname = usePathname();

  // 현재 언어 추출
  const getCurrentLanguage = useCallback((): SupportedLanguage => {
    const lang = pathname.split('/')[1];
    switch (lang) {
      case 'ko':
        return 'ko';
      case 'ja':
        return 'ja';
      case 'zh':
        return 'zh';
      case 'id':
        return 'id';
      default:
        return 'en';
    }
  }, [pathname]);

  // 날짜 포맷팅
  const formatDate = useCallback((dateString: string) => {
    const currentLang = getCurrentLanguage();
    return formatDateWithTimeZone(dateString, undefined, currentLang);
  }, [getCurrentLanguage]);

  // 다국어 텍스트 처리 (방어형)
  const getLocalizedText = useCallback((text: any): string => {
    try {
      if (text === null || text === undefined || text === '') {
        return '';
      }
      
      if (typeof text === 'string') {
        return text;
      }
      
      if (typeof text === 'number' || typeof text === 'boolean') {
        return String(text);
      }
      
      if (Array.isArray(text)) {
        return text.length > 0 ? String(text[0]) : '';
      }
      
      if (text.$$typeof || text._owner || text.type || text.props) {
        console.error('🚨 React 컴포넌트 감지! 강제 변환:', text);
        return '[React Element Detected]';
      }
      
      if (typeof text === 'object' && text !== null) {
        const currentLang = getCurrentLanguage();
        
        let result: any = '';
        
        if (text[currentLang] !== undefined && text[currentLang] !== null) {
          result = text[currentLang];
        } else if (text.en !== undefined && text.en !== null) {
          result = text.en;
        } else if (text.ko !== undefined && text.ko !== null) {
          result = text.ko;
        } else {
          const keys = Object.keys(text);
          for (const key of keys) {
            if (text[key] !== null && text[key] !== undefined && text[key] !== '') {
              result = text[key];
              break;
            }
          }
        }
        
        if (typeof result === 'object' && result !== null) {
          return getLocalizedText(result);
        }
        
        return String(result || '');
      }
      
      return String(text);
      
    } catch (error) {
      console.error('💥 getLocalizedText 치명적 오류:', {
        error: error instanceof Error ? error.message : String(error),
        input: text,
        inputType: typeof text
      });
      
      try {
        return JSON.stringify(text);
      } catch {
        return '[처리 불가능한 데이터]';
      }
    }
  }, [getCurrentLanguage]);

  return {
    currentLanguage: getCurrentLanguage(),
    getCurrentLanguage,
    formatDate,
    getLocalizedText
  };
} 