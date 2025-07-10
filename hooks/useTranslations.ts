'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { SupportedLanguage } from '@/types/mypage-common';

// 번역 캐시
const translationCache = new Map<string, Record<string, string>>();
const loadingPromises = new Map<string, Promise<Record<string, string>>>();

// 타입 안전한 번역 키 정의
export type TranslationKey = 
  // 공통 키
  | 'label_loading'
  | 'label_error_occurred'
  | 'label_retry'
  | 'label_back_to_mypage'
  | 'label_please_try_again'
  | 'label_unknown'
  | 'label_view'
  | 'label_anonymous'
  | 'label_no_title'
  
  // 마이페이지 공통
  | 'label_all_data_loaded'
  | 'label_load_more'
  | 'label_scroll_for_more'
  
  // 게시물 관련
  | 'page_title_my_posts'
  | 'label_no_posts'
  | 'label_post_title'
  | 'label_post_content'
  | 'label_post_date'
  | 'label_loading_posts'
  | 'label_all_posts_checked'
  | 'label_content_preview_two_lines'
  | 'label_board'
  | 'label_total_posts_count'
  | 'label_no_posts_description'
  | 'views'
  | 'comments'
  | 'label_total_views'
  | 'label_total_comments'
  | 'label_popular_post'
  | 'label_no_posts_yet'
  | 'label_write_first_post'
  | 'label_go_to_board'
  | 'label_all_posts_loaded'
  | 'label_posts_description'
  | 'label_views_description'
  | 'label_comments_description'
  
  // 댓글 관련
  | 'page_title_my_comments'
  | 'label_no_comments'
  | 'label_comment_content'
  | 'label_comment_date'
  | 'label_loading_comments'
  | 'label_all_comments_checked'
  | 'label_total_comments_count'
  | 'label_likes'
  | 'label_no_comments_yet'
  | 'label_write_first_comment'
  | 'label_all_comments_loaded'
  | 'label_total_likes'
  | 'label_likes_description'
  | 'label_view_original_post'
  | 'label_popular_comment'
  
  // 투표 기록 관련
  | 'page_title_vote_history'
  | 'label_no_vote_history'
  | 'label_vote_title'
  | 'label_vote_date'
  | 'label_my_choice'
  | 'label_vote_result'
  | 'label_loading_vote_history'
  | 'label_all_vote_history_loaded'
  | 'label_total_votes_count'
  | 'label_vote_history_description'
  
  // 충전 기록 관련
  | 'page_title_recharge_history'
  | 'label_no_recharge_history'
  | 'label_amount'
  | 'label_recharge_date'
  | 'label_payment_method'
  | 'label_transaction_status'
  | 'label_loading_recharge_history'
  | 'label_all_recharge_history_loaded'
  | 'label_total_recharge_count'
  | 'label_received_star_candy'
  | 'label_recharge_description'
  
  // 오류 메시지
  | 'error_posts_fetch_failed'
  | 'error_unknown_occurred'
  | 'error_unknown'
  | 'console_posts_fetch_error'
  | 'console_content_parsing_error';

// 기본 번역문 (폴백용)
const DEFAULT_TRANSLATIONS: Record<TranslationKey, string> = {
  // 공통
  label_loading: 'Loading...',
  label_error_occurred: 'An error occurred',
  label_retry: 'Retry',
  label_back_to_mypage: 'Back to My Page',
  label_please_try_again: 'Please try again',
  label_unknown: 'Unknown',
  label_view: 'View',
  label_anonymous: 'Anonymous',
  label_no_title: 'No Title',
  
  // 마이페이지 공통
  label_all_data_loaded: 'All data loaded',
  label_load_more: 'Load more',
  label_scroll_for_more: 'Scroll for more',
  
  // 게시물
  page_title_my_posts: 'My Posts',
  label_no_posts: 'No posts',
  label_post_title: 'Post Title',
  label_post_content: 'Post Content',
  label_post_date: 'Post Date',
  label_loading_posts: 'Loading posts...',
  label_all_posts_checked: 'All posts checked',
  label_content_preview_two_lines: 'Content Preview',
  label_board: 'Board',
  label_total_posts_count: 'Total Posts',
  label_no_posts_description: 'No posts yet',
  views: 'Views',
  comments: 'Comments',
  label_total_views: 'Total Views',
  label_total_comments: 'Total Comments',
  label_popular_post: 'Popular Post',
  label_no_posts_yet: 'No posts yet',
  label_write_first_post: 'Write your first post',
  label_go_to_board: 'Go to board',
  label_all_posts_loaded: 'All posts loaded',
  label_posts_description: 'Posts you wrote',
  label_views_description: 'Total views',
  label_comments_description: 'Comments received',
  
  // 댓글
  page_title_my_comments: 'My Comments',
  label_no_comments: 'No comments',
  label_comment_content: 'Comment Content',
  label_comment_date: 'Comment Date',
  label_loading_comments: 'Loading comments...',
  label_all_comments_checked: 'All comments checked',
  label_total_comments_count: 'Total Comments',
  label_likes: 'Likes',
  label_no_comments_yet: 'No comments yet',
  label_write_first_comment: 'Write your first comment',
  label_all_comments_loaded: 'All comments loaded',
  label_total_likes: 'Total Likes',
  label_likes_description: 'Likes received',
  label_view_original_post: 'View Original Post',
  label_popular_comment: 'Popular Comment',
  
  // 투표 기록
  page_title_vote_history: 'Vote History',
  label_no_vote_history: 'No vote history',
  label_vote_title: 'Vote Title',
  label_vote_date: 'Vote Date',
  label_my_choice: 'My Choice',
  label_vote_result: 'Vote Result',
  label_loading_vote_history: 'Loading vote history...',
  label_all_vote_history_loaded: 'All vote history loaded',
  label_total_votes_count: 'Total Votes',
  label_vote_history_description: 'Your vote history',
  
  // 충전 기록
  page_title_recharge_history: 'Recharge History',
  label_no_recharge_history: 'No recharge history',
  label_amount: 'Amount',
  label_recharge_date: 'Recharge Date',
  label_payment_method: 'Payment Method',
  label_transaction_status: 'Transaction Status',
  label_loading_recharge_history: 'Loading recharge history...',
  label_all_recharge_history_loaded: 'All recharge history loaded',
  label_total_recharge_count: 'Total Recharges',
  label_received_star_candy: 'Received Star Candy',
  label_recharge_description: 'Your recharge history',
  
  // 오류
  error_posts_fetch_failed: 'Failed to fetch posts',
  error_unknown_occurred: 'An unknown error occurred',
  error_unknown: 'Unknown error',
  console_posts_fetch_error: 'Posts fetch error',
  console_content_parsing_error: 'Content parsing error',
};

export function useTranslations() {
  const pathname = usePathname();
  const [translations, setTranslations] = useState<Record<string, string>>(DEFAULT_TRANSLATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentLangRef = useRef<SupportedLanguage>('en');

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

  // 번역 파일 로드 함수
  const loadTranslations = useCallback(async (language: SupportedLanguage) => {
    const cacheKey = language;
    
    // 캐시에서 확인
    const cached = translationCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // 이미 로딩 중인지 확인
    const existingPromise = loadingPromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    // 새로운 로딩 프로미스 생성
    const loadingPromise = (async () => {
      try {
        const module = await import(`../public/locales/${language}.json`);
        const translations = module.default;
        
        // 캐시에 저장
        translationCache.set(cacheKey, translations);
        loadingPromises.delete(cacheKey);
        
        return translations;
      } catch (error) {
        console.warn(`번역 파일 로드 실패 (${language}):`, error);
        loadingPromises.delete(cacheKey);
        
        // 영어 폴백 시도
        if (language !== 'en') {
          try {
            const fallbackModule = await import('../public/locales/en.json');
            const fallbackTranslations = fallbackModule.default;
            translationCache.set('en', fallbackTranslations);
            return fallbackTranslations;
          } catch (fallbackError) {
            console.error('영어 폴백도 실패:', fallbackError);
            return DEFAULT_TRANSLATIONS;
          }
        }
        
        return DEFAULT_TRANSLATIONS;
      }
    })();

    loadingPromises.set(cacheKey, loadingPromise);
    return loadingPromise;
  }, []);

  // 언어 변경 감지 및 번역 로드
  useEffect(() => {
    const currentLang = getCurrentLanguage();
    
    // 언어가 변경되지 않았으면 스킵
    if (currentLang === currentLangRef.current && !isLoading) {
      return;
    }

    currentLangRef.current = currentLang;
    setIsLoading(true);
    setError(null);

    loadTranslations(currentLang)
      .then((loadedTranslations) => {
        setTranslations(loadedTranslations);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('번역 로드 실패:', error);
        setError(error instanceof Error ? error.message : 'Translation load failed');
        setTranslations(DEFAULT_TRANSLATIONS);
        setIsLoading(false);
      });
  }, [getCurrentLanguage, loadTranslations, isLoading]);

  // 타입 안전한 번역 함수
  const t = useCallback((key: TranslationKey, fallback?: string): string => {
    return translations[key] || fallback || DEFAULT_TRANSLATIONS[key] || key;
  }, [translations]);

  // 동적 키 지원 (기존 호환성)
  const tDynamic = useCallback((key: string, fallback?: string): string => {
    return translations[key] || fallback || key;
  }, [translations]);

  return {
    t,                      // 타입 안전한 번역 함수
    tDynamic,              // 동적 키 지원 번역 함수 (기존 호환성)
    translations,          // 전체 번역 객체 (기존 호환성)
    currentLanguage: getCurrentLanguage(),
    isLoading,
    error,
    reload: () => loadTranslations(getCurrentLanguage())
  };
} 