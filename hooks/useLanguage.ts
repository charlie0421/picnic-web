import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { 
  formatDateWithTimeZone, 
  formatRelativeTime, 
  formatSmartDate
} from '@/utils/date';
import type { SupportedLanguage } from '@/types/mypage-common';

export function useLanguage() {
  const pathname = usePathname();

  // 현재 언어 추출
  const getCurrentLanguage = useCallback((): SupportedLanguage => {
    const segment = (pathname.split('/')[1] || '').toLowerCase();
    const match = segment.match(/^([a-z]{2}(?:-[a-z]{2})?)$/i);
    const candidate = (match ? match[1] : 'en').toLowerCase();
    const supported: SupportedLanguage[] = ['en','ko','ja','zh-cn','zh-tw','id','es','bn','tl','th','vi','my'];
    // 레거시 경로 호환: '/zh' 는 'zh-cn' 으로 간주
    const normalized = candidate === 'zh' ? 'zh-cn' : candidate;
    return (supported.includes(normalized as SupportedLanguage) ? normalized : 'en') as SupportedLanguage;
  }, [pathname]);

  // 기본 날짜 포맷팅 (기존 호환성 유지)
  const formatDate = useCallback((dateString: string) => {
    const currentLang = getCurrentLanguage();
    return formatDateWithTimeZone(dateString, undefined, currentLang);
  }, [getCurrentLanguage]);

  // 상대적 시간 포맷팅 (예: "3시간 전", "2일 전")
  const formatRelativeDate = useCallback((
    dateString: string,
    options?: {
      useAbsolute?: boolean;
      absoluteThreshold?: number;
      showTime?: boolean;
    }
  ) => {
    const currentLang = getCurrentLanguage();
    return formatRelativeTime(dateString, currentLang, options);
  }, [getCurrentLanguage]);

  // 스마트 날짜 포맷팅 (컨텍스트에 따라 자동 선택)
  const formatSmartDateInternal = useCallback((
    dateString: string,
    context: 'post' | 'comment' | 'detailed' = 'post'
  ) => {
    const currentLang = getCurrentLanguage();
    return formatSmartDate(dateString, currentLang, context);
  }, [getCurrentLanguage]);

  // Post/Comment 전용 날짜 포맷터
  const formatPostDate = useCallback((dateString: string) => {
    return formatSmartDateInternal(dateString, 'post');
  }, [formatSmartDateInternal]);

  const formatCommentDate = useCallback((dateString: string) => {
    return formatSmartDateInternal(dateString, 'comment');
  }, [formatSmartDateInternal]);



  // 다국어 텍스트 처리 (기존 기능 유지)
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
      // 기본 정보
      currentLanguage: getCurrentLanguage(),
      getCurrentLanguage,
      
      // 날짜 포맷팅 함수들
      formatDate,              // 기존 호환성 (절대 시간 + 시간대)
      formatRelativeDate,      // 상대적 시간 ("3시간 전")
      formatSmartDate: formatSmartDateInternal, // 컨텍스트별 스마트 포맷팅
      formatPostDate,          // 게시물용 최적화
      formatCommentDate,       // 댓글용 최적화
      
      // 기존 기능
      getLocalizedText
    };
} 