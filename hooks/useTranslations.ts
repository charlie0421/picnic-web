'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { SupportedLanguage } from '@/types/mypage-common';

// 번역 캐시
const translationCache = new Map<string, Record<string, any>>();
const loadingPromises = new Map<string, Promise<Record<string, any>>>();

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
  | 'label_mypage_my_votes'
  | 'label_vote_amount'
  | 'label_vote_category'
  | 'label_artist_name'
  | 'label_group_name'
  | 'label_no_more_votes'
  | 'label_star_candy'
  | 'label_vote_status_ongoing'
  | 'label_vote_status_ended'
  | 'label_vote_status_upcoming'
  | 'label_group_separator'
  | 'label_artist'
  | 'label_all_votes_checked'
  | 'label_total_star_candy_used'
  | 'label_supported_artists'
  | 'label_no_vote_history_yet'
  | 'label_vote_for_favorite_artist'
  | 'label_go_to_vote'
  | 'label_all_vote_history_checked'
  | 'page_title_my_vote_history'
  | 'label_total_votes'
  | 'label_votes_description'
  | 'label_total_amount'
  | 'label_amount_description'
  | 'label_votes_this_month'
  | 'label_month_description'
  | 'label_voted_item'
  | 'label_vote_type'
  | 'label_general_vote'
  | 'label_total_votes_for_item'
  | 'label_no_vote_history_description'
  
  // 충전 기록 관련
  | 'page_title_my_recharge_history'
  | 'page_title_recharge_history'
  | 'label_no_recharge_history'
  | 'label_recharge_amount'
  | 'label_amount'
  | 'label_recharge_date'
  | 'label_recharge_method'
  | 'label_payment_method'
  | 'label_star_candy_amount'
  | 'label_transaction_status'
  | 'label_loading_recharge_history'
  | 'label_all_recharge_history_loaded'
  | 'label_all_recharge_history_checked'
  | 'label_total_recharge_count'
  | 'label_received_star_candy'
  | 'label_recharge_description'
  | 'text_star_candy'
  | 'label_total_recharge_amount'
  | 'label_receipt'
  | 'label_payment_amount'
  | 'label_exchange_rate'
  | 'label_bonus'
  | 'label_card_payment'
  | 'label_bank_transfer'
  | 'label_product_info'
  | 'label_quantity'
  | 'label_unit_price'
  | 'label_transaction_info'
  | 'label_transaction_id'
  | 'label_merchant_transaction_id'
  | 'label_transaction_datetime'
  | 'label_transaction_time'
  | 'label_receipt_generated'
  | 'label_no_recharge_history_message'
  | 'label_go_recharge_star_candy'
  | 'label_star_candy_recharge'
  | 'star_candy_purchase_description'
  | 'label_recharge_count_description'
  | 'label_star_candy_description'
  | 'label_copy'
  | 'label_product_code'
  | 'timezone_kst'
  | 'label_paypal'
  | 'label_total_transactions'
  | 'label_transactions_description'
  | 'label_total_recharged'
  | 'label_recharged_description'
  | 'label_this_month'
  | 'label_product_name'
  | 'label_unknown_product'
  | 'label_payment_status'
  | 'label_payment_completed'
  | 'label_payment_pending'
  | 'label_payment_failed'
  | 'label_transaction_date'
  
  // 오류 메시지
  | 'error_posts_fetch_failed'
  | 'error_unknown_occurred'
  | 'error_unknown'
  | 'error_recharge_history_fetch_failed'
  | 'console_posts_fetch_error'
  | 'console_content_parsing_error'
  | 'console_recharge_history_fetch_error';

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
  label_mypage_my_votes: 'My Votes',
  label_vote_amount: 'Vote Amount',
  label_vote_category: 'Vote Category',
  label_artist_name: 'Artist Name',
  label_group_name: 'Group Name',
  label_no_more_votes: 'No more votes',
  label_star_candy: 'Star Candy',
  label_vote_status_ongoing: 'Ongoing',
  label_vote_status_ended: 'Ended',
  label_vote_status_upcoming: 'Upcoming',
  label_group_separator: ' · ',
  label_artist: 'Artist',
  label_all_votes_checked: 'All votes checked',
  label_total_star_candy_used: 'Total Star Candy Used',
  label_supported_artists: 'Supported Artists',
  label_no_vote_history_yet: 'No vote history yet',
  label_vote_for_favorite_artist: 'Vote for your favorite artist',
  label_go_to_vote: 'Go to Vote',
  label_all_vote_history_checked: 'All vote history checked',
  page_title_my_vote_history: 'My Vote History',
  label_total_votes: 'Total Votes',
  label_votes_description: 'Your votes count',
  label_total_amount: 'Total Amount',
  label_amount_description: 'Star candy used',
  label_votes_this_month: 'Votes This Month',
  label_month_description: 'This month activity',
  label_voted_item: 'Voted Item',
  label_vote_type: 'Vote Type',
  label_general_vote: 'General Vote',
  label_total_votes_for_item: 'Total Votes for Item',
  label_no_vote_history_description: 'Start voting to see your history',
  
  // 충전 기록
  page_title_recharge_history: 'Recharge History',
  page_title_my_recharge_history: 'My Recharge History',
  label_no_recharge_history: 'No recharge history',
  label_recharge_amount: 'Recharge Amount',
  label_amount: 'Amount',
  label_recharge_date: 'Recharge Date',
  label_recharge_method: 'Recharge Method',
  label_payment_method: 'Payment Method',
  label_star_candy_amount: 'Star Candy Amount',
  label_transaction_status: 'Transaction Status',
  label_loading_recharge_history: 'Loading recharge history...',
  label_all_recharge_history_loaded: 'All recharge history loaded',
  label_all_recharge_history_checked: 'All recharge history checked',
  label_total_recharge_count: 'Total Recharges',
  label_received_star_candy: 'Received Star Candy',
  label_recharge_description: 'Your recharge history',
  text_star_candy: 'Star Candy',
  label_total_recharge_amount: 'Total Recharge Amount',
  label_receipt: 'Receipt',
  label_payment_amount: 'Payment Amount',
  label_exchange_rate: 'Exchange Rate',
  label_bonus: 'Bonus',
  label_card_payment: 'Card Payment',
  label_bank_transfer: 'Bank Transfer',
  label_product_info: 'Product Info',
  label_quantity: 'Quantity',
  label_unit_price: 'Unit Price',
  label_transaction_info: 'Transaction Info',
  label_transaction_id: 'Transaction ID',
  label_merchant_transaction_id: 'Merchant Transaction ID',
  label_transaction_datetime: 'Transaction DateTime',
  label_transaction_time: 'Transaction Time',
  label_receipt_generated: 'Receipt Generated',
  label_no_recharge_history_message: 'No recharge history yet',
  label_go_recharge_star_candy: 'Go Recharge Star Candy',
  label_star_candy_recharge: 'Star Candy Recharge',
  star_candy_purchase_description: 'Star Candy Purchase',
  label_recharge_count_description: 'Number of recharges',
  label_star_candy_description: 'Total star candy',
  label_copy: 'Copy',
  label_product_code: 'Product Code',
  timezone_kst: 'KST',
  label_paypal: 'PayPal',
  label_total_transactions: 'Total Transactions',
  label_transactions_description: 'Number of transactions',
  label_total_recharged: 'Total Recharged',
  label_recharged_description: 'Total amount recharged',
  label_this_month: 'This Month',
  label_product_name: 'Product Name',
  label_unknown_product: 'Unknown Product',
  label_payment_status: 'Payment Status',
  label_payment_completed: 'Completed',
  label_payment_pending: 'Pending',
  label_payment_failed: 'Failed',
  label_transaction_date: 'Transaction Date',
  
  // 오류
  error_posts_fetch_failed: 'Failed to fetch posts',
  error_unknown_occurred: 'An unknown error occurred',
  error_unknown: 'Unknown error',
  error_recharge_history_fetch_failed: 'Failed to fetch recharge history',
  console_posts_fetch_error: 'Posts fetch error',
  console_content_parsing_error: 'Content parsing error',
  console_recharge_history_fetch_error: 'Recharge history fetch error',
};

export function useTranslations() {
  const pathname = usePathname();
  const [translations, setTranslations] = useState<Record<string, any>>(DEFAULT_TRANSLATIONS);
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