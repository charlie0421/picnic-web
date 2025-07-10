import { User } from '@supabase/supabase-js';

// 공통 페이지네이션 인터페이스
export interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
}

// 공통 API 응답 구조
export interface BaseResponse<T> {
  success: boolean;
  data: T[];
  pagination: Pagination;
  error?: string;
}

// 공통 통계 카드 데이터
export interface StatisticCard {
  id: string;
  title: string;
  value: number | string;
  description?: string;
  icon: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  isLoading?: boolean;
}

// 무한 스크롤 상태
export interface InfiniteScrollState {
  page: number;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  isInitialLoad: boolean;
  error: string | null;
  totalCount: number;
}

// 언어 타입
export type SupportedLanguage = 'en' | 'ko' | 'ja' | 'zh' | 'id';

// 공통 페이지 props
export interface BaseMypageProps {
  initialUser: User;
  translations: Record<string, string>;
}

// 헤더 설정
export interface MypageHeaderConfig {
  title: string;
  icon: string;
  backUrl?: string;
  backLabel?: string;
}

// 빈 상태 설정
export interface EmptyStateConfig {
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  icon: string;
}

// 공통 번역 키들
export interface CommonTranslations {
  // 공통 액션
  label_loading: string;
  label_retry: string;
  label_back_to_mypage: string;
  label_please_try_again: string;
  label_scroll_for_more: string;
  label_error_occurred: string;
  
  // 공통 상태
  label_no_data: string;
  label_all_data_loaded: string;
  label_load_more: string;
  
  // 공통 날짜/시간
  label_date: string;
  label_time: string;
} 