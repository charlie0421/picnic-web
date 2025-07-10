'use client';

import { useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, InitialLoadingState, EmptyState, InfiniteScrollTrigger } from '@/components/mypage/MypageStates';
import type { StatisticCard, MypageHeaderConfig, EmptyStateConfig } from '@/types/mypage-common';

interface PostItem {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  boardName: string;
  isAnonymous: boolean;
}

interface Translations {
  page_title_my_posts: string;
  label_loading: string;
  label_no_posts: string;
  label_load_more: string;
  label_post_title: string;
  label_post_content: string;
  label_post_date: string;
  label_error_occurred: string;
  label_retry: string;
  label_back_to_mypage: string;
  label_please_try_again: string;
  label_loading_posts: string;
  label_all_posts_checked: string;
  label_content_preview_two_lines: string;
  label_board: string;
  label_total_posts_count: string;
  label_scroll_for_more: string;
  label_no_posts_description: string;
  views: string;
  label_title_comment: string;
  comments: string;
  label_anonymous: string;
  error_posts_fetch_failed: string;
  error_unknown: string;
  label_total_views: string;
  label_total_comments: string;
  label_popular_post: string;
  label_no_posts_yet: string;
  label_write_first_post: string;
  label_go_to_board: string;
  label_all_posts_loaded: string;
  error_unknown_occurred: string;
  console_posts_fetch_error: string;
  console_content_parsing_error: string;
  label_posts_description: string;
  label_views_description: string;
  label_comments_description: string;
}

interface PostsClientProps {
  initialUser: User;
  translations: Translations;
}

export default function PostsClient({ initialUser, translations }: PostsClientProps) {
  const { formatDate } = useLanguage();
  const t = (key: keyof Translations) => translations[key] || key;

  // 데이터 변환 함수
  const transformPostItem = useCallback((item: any): PostItem => {
    return {
      ...item,
      content: item.content || '',
      title: item.title || '',
      boardName: item.boardName || '',
      viewCount: Number(item.viewCount) || 0,
      commentCount: Number(item.commentCount) || 0,
      isAnonymous: Boolean(item.isAnonymous)
    };
  }, []);

  // 무한 스크롤 훅 사용
  const {
    items: posts,
    statistics,
    isLoading,
    isLoadingMore,
    isInitialLoad,
    hasMore,
    error,
    totalCount,
    sentinelRef,
    retry,
    isEmpty,
    isLastPage
  } = useInfiniteScroll<PostItem>({
    apiEndpoint: '/api/user/posts',
    limit: 10,
    transform: transformPostItem,
    onSuccess: (data) => {
      console.log('📡 API 응답 데이터:', data);
    },
    onError: (error) => {
      console.error('게시글 조회 에러:', error);
    }
  });

  // 콘텐츠 축약 함수
  const truncateContent = (content: string | any) => {
    // content가 문자열이 아닌 경우 (Quill Delta 형식 등)
    if (typeof content !== 'string') {
      try {
        // Quill Delta 형식인 경우 텍스트만 추출
        if (content && Array.isArray(content.ops)) {
          const plainText = content.ops
            .map((op: any) => typeof op.insert === 'string' ? op.insert : '')
            .join('')
            .replace(/\n+/g, '\n') // 연속된 줄바꿈 정리
            .trim();
          return cleanAndTruncateToTwoLines(plainText);
        }
        
        // JSON 객체인 경우 문자열로 변환 시도
        if (typeof content === 'object') {
          const jsonString = JSON.stringify(content);
          return parseQuillDeltaFromString(jsonString);
        }
        
        // 기타 경우 빈 문자열 반환
        return '';
      } catch (error) {
        console.warn(t('console_content_parsing_error') + ':', error);
        return '';
      }
    }
    
    // 문자열인 경우 - 강화된 파싱 로직
    return parseQuillDeltaFromString(content);
  };

  // 강화된 Quill Delta 문자열 파싱 함수
  const parseQuillDeltaFromString = (text: string) => {
    if (!text) return '';

    // 1. 문자열로 저장된 Quill Delta 형식 파싱 (예: "[ insert : \nHi\n\n ]")
    const insertMatches = text.match(/insert\s*:\s*([^,\]]+)/g);
    if (insertMatches) {
      const extractedTexts = insertMatches.map(match => {
        // "insert : 텍스트" 에서 텍스트 부분만 추출
        const textPart = match.replace(/^insert\s*:\s*/, '').trim();
        // 따옴표 제거
        return textPart.replace(/^["']|["']$/g, '');
      });
      
      const combinedText = extractedTexts.join(' ').trim();
      if (combinedText && combinedText !== '\n' && combinedText !== '\\n') {
        return cleanAndTruncateToTwoLines(combinedText);
      }
    }

    // 2. JSON 형태의 Quill Delta 파싱 시도
    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.ops)) {
        const plainText = parsed.ops
          .map((op: any) => typeof op.insert === 'string' ? op.insert : '')
          .join('')
          .trim();
        if (plainText) {
          return cleanAndTruncateToTwoLines(plainText);
        }
      }
    } catch (e) {
      // JSON 파싱 실패는 정상 - 계속 진행
    }

    // 3. 배열 형태의 문자열 파싱 (예: "[{\"insert\":\"Hello\"}]")
    const arrayMatches = text.match(/\[\s*\{[^}]*"insert"\s*:\s*"([^"]+)"[^}]*\}\s*\]/g);
    if (arrayMatches) {
      const extractedTexts = arrayMatches.map(match => {
        const insertMatch = match.match(/"insert"\s*:\s*"([^"]+)"/);
        return insertMatch ? insertMatch[1] : '';
      }).filter(t => t);
      
      if (extractedTexts.length > 0) {
        const combinedText = extractedTexts.join(' ').trim();
        return cleanAndTruncateToTwoLines(combinedText);
      }
    }

    // 4. 단순 "insert" 키워드가 포함된 텍스트에서 실제 내용 추출
    const simpleInsertMatch = text.match(/insert[^a-zA-Z0-9가-힣]*([a-zA-Z0-9가-힣\s.,!?]+)/i);
    if (simpleInsertMatch && simpleInsertMatch[1]) {
      const extractedText = simpleInsertMatch[1].trim();
      if (extractedText && extractedText.length > 2) {
        return cleanAndTruncateToTwoLines(extractedText);
      }
    }

    // 5. 일반 텍스트로 처리
    return cleanAndTruncateToTwoLines(text);
  };

  // 2줄로 제한하는 헬퍼 함수 (강화된 버전)
  const cleanAndTruncateToTwoLines = (text: string) => {
    if (!text) return '';
    
    // 1차 정리: HTML 태그 및 특수 문자 제거
    let cleanText = text
      .replace(/<[^>]*>/g, '') // HTML 태그 제거
      .replace(/&nbsp;/g, ' ') // &nbsp; 엔티티를 공백으로
      .replace(/&lt;/g, '<') // HTML 엔티티 디코딩
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\\n/g, '\n') // 이스케이프된 줄바꿈을 실제 줄바꿈으로
      .replace(/\\t/g, ' ') // 탭을 공백으로
      .replace(/\\r/g, '') // 캐리지 리턴 제거
      .replace(/[\[\]{}]/g, '') // 대괄호, 중괄호 제거
      .replace(/[,:;]/g, ' ') // 특수 문자를 공백으로
      .replace(/\s+/g, ' ') // 연속된 공백을 하나로
      .trim();
    
    if (!cleanText || cleanText.length < 2) return '';
    
    // 2차 정리: 줄바꿈으로 분할하여 의미 있는 줄만 추출
    const lines = cleanText
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        // 빈 줄이나 의미 없는 줄 제거
        return line && 
               line !== '\\n' && 
               line !== '\n' && 
               line.length > 1 &&
               !line.match(/^[\\n\s]*$/); // 공백이나 줄바꿈만 있는 줄 제거
      });
    
    if (lines.length === 0) return '';
    
    // 첫 번째 줄 처리
    let firstLine = lines[0];
    if (firstLine.length > 70) {
      // 자연스러운 절단점 찾기 (공백, 구두점)
      const cutPoint = firstLine.lastIndexOf(' ', 70) || firstLine.lastIndexOf('.', 70) || firstLine.lastIndexOf(',', 70);
      firstLine = cutPoint > 30 ? firstLine.substring(0, cutPoint) + '...' : firstLine.substring(0, 70) + '...';
    }
    
    // 한 줄만 있으면 반환
    if (lines.length === 1) {
      return firstLine;
    }
    
    // 두 번째 줄 처리
    let secondLine = lines[1];
    if (secondLine.length > 70) {
      const cutPoint = secondLine.lastIndexOf(' ', 70) || secondLine.lastIndexOf('.', 70) || secondLine.lastIndexOf(',', 70);
      secondLine = cutPoint > 30 ? secondLine.substring(0, cutPoint) + '...' : secondLine.substring(0, 70) + '...';
    }
    
    return `${firstLine}\n${secondLine}`;
  };

  // 헤더 설정
  const headerConfig: MypageHeaderConfig = {
    title: t('page_title_my_posts'),
    icon: '📝',
    backUrl: '/mypage',
    backLabel: t('label_back_to_mypage')
  };

  // 통계 카드 설정
  const statisticsCards: StatisticCard[] = [
    {
      id: 'primary',
      title: t('label_total_posts_count'),
      value: totalCount,
      description: t('label_posts_description'),
      icon: '📊',
      bgColor: 'from-primary-50 to-primary-100',
      borderColor: 'border-primary-200/50',
      textColor: 'text-primary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'secondary',
      title: t('label_total_views'),
      value: statistics?.totalViews || 0,
      description: t('label_views_description'),
      icon: '👁️',
      bgColor: 'from-secondary-50 to-secondary-100',
      borderColor: 'border-secondary-200/50',
      textColor: 'text-secondary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'point',
      title: t('label_total_comments'),
      value: statistics?.totalComments || 0,
      description: t('label_comments_description'),
      icon: '💬',
      bgColor: 'from-point-50 to-point-100',
      borderColor: 'border-point-200/50',
      textColor: 'text-point-800',
      isLoading: isLoading || isInitialLoad
    }
  ];

  // 빈 상태 설정
  const emptyStateConfig: EmptyStateConfig = {
    title: t('label_no_posts_yet'),
    description: t('label_write_first_post'),
    actionLabel: t('label_go_to_board'),
    actionUrl: '/board',
    icon: '📝'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-4 max-w-4xl">
        {/* 헤더 */}
        <MypageHeader 
          config={headerConfig}
          statistics={statisticsCards}
          translations={translations}
        />

        {/* 오류 상태 */}
        {error && (
          <div className="mb-4">
            <ErrorState 
              error={error}
              onRetry={retry}
              translations={translations}
            />
          </div>
        )}

        {/* 초기 로딩 상태 */}
        {(isLoading || isInitialLoad) && posts.length === 0 && !error && (
          <InitialLoadingState translations={translations} />
        )}

        {/* 빈 상태 */}
        {isEmpty && (
          <EmptyState 
            config={emptyStateConfig}
            translations={translations}
          />
        )}

        {/* 게시글 리스트 */}
        <div className="space-y-4">
          {posts.map((post, index) => (
            <div 
              key={post.id} 
              className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md hover:shadow-lg border border-white/30 overflow-hidden transition-all duration-300 transform hover:scale-[1.01] hover:-translate-y-1"
              style={{
                animationDelay: `${index * 50}ms`
              }}
            >
              {/* 상단 그라데이션 바 */}
              <div className="h-1 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              
              {/* 배경 데코레이션 */}
              <div className="absolute top-2 right-2 w-12 h-12 bg-gradient-to-br from-primary-50 to-point-50 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
              
              <div className="relative p-4">
                <div className="flex items-start space-x-4">
                  {/* 게시글 정보 */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-1">
                          {post.title || t('label_post_title')}
                        </h3>
                        <div className="h-0.5 w-12 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      {post.isAnonymous && (
                        <div className="flex-shrink-0 ml-4">
                          <span className="px-2 py-1 text-xs font-semibold rounded-lg border bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-700">
                            {t('label_anonymous')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 콘텐츠 미리보기 */}
                    <div className="mb-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📄</span>
                          </div>
                          <span className="font-bold text-gray-800 text-sm">{t('label_post_content')}</span>
                        </div>
                        <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                          {truncateContent(post.content) || t('label_content_preview_two_lines')}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* 조회수 */}
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-primary to-point rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">👁️</span>
                          </div>
                          <span className="font-bold text-primary-800 text-sm">{t('views')}</span>
                        </div>
                        <span className="text-gray-900 font-bold text-lg">{post.viewCount.toLocaleString()}</span>
                      </div>
                      
                      {/* 댓글 수 */}
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-xl p-3 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-sub to-secondary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">💬</span>
                          </div>
                          <span className="font-bold text-sub-800 text-sm">{t('comments')}</span>
                        </div>
                        <span className="text-gray-900 font-bold text-lg">{post.commentCount.toLocaleString()}</span>
                      </div>

                      {/* 게시판 */}
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-xl p-3 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📋</span>
                          </div>
                          <span className="font-bold text-secondary-800 text-sm">{t('label_board')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{post.boardName}</span>
                      </div>

                      {/* 작성일 */}
                      <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📅</span>
                          </div>
                          <span className="font-bold text-point-800 text-sm">{t('label_post_date')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{formatDate(post.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 트리거 */}
        {!isEmpty && (
          <div ref={sentinelRef}>
            <InfiniteScrollTrigger 
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              isLastPage={isLastPage}
              translations={translations}
            />
          </div>
        )}
      </div>
    </div>
  );
} 