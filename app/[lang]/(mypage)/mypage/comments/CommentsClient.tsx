'use client';

import { useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, InitialLoadingState, EmptyState, InfiniteScrollTrigger } from '@/components/mypage/MypageStates';
import type { StatisticCard, MypageHeaderConfig, EmptyStateConfig } from '@/types/mypage-common';

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  likeCount: number;
  postId: string;
  postTitle: string;
  boardName: string;
  isAnonymous: boolean;
}

interface Translations {
  page_title_my_comments: string;
  label_loading: string;
  label_no_comments: string;
  label_load_more: string;
  label_comment_content: string;
  label_comment_date: string;
  label_error_occurred: string;
  label_retry: string;
  label_back_to_mypage: string;
  label_please_try_again: string;
  label_loading_comments: string;
  label_all_comments_checked: string;
  label_board: string;
  label_total_comments_count: string;
  label_scroll_for_more: string;
  label_likes: string;
  label_anonymous: string;
  label_view_original_post: string;
  label_no_comments_yet: string;
  label_write_first_comment: string;
  label_go_to_board: string;
  label_all_comments_loaded: string;
  label_total_likes: string;
  label_popular_comment: string;
  label_comments_description: string;
  label_likes_description: string;
  label_posts_description: string;
}

interface CommentsClientProps {
  initialUser: User;
  translations: Translations;
}

export default function CommentsClient({ initialUser, translations }: CommentsClientProps) {
  const { formatDate } = useLanguage();
  const t = (key: keyof Translations) => translations[key] || key;

  // 데이터 변환 함수
  const transformCommentItem = useCallback((item: any): CommentItem => {
    return {
      ...item,
      content: item.content || '',
      postTitle: item.postTitle || '',
      boardName: item.boardName || '',
      likeCount: Number(item.likeCount) || 0,
      isAnonymous: Boolean(item.isAnonymous)
    };
  }, []);

  // 무한 스크롤 훅 사용
  const {
    items: comments,
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
  } = useInfiniteScroll<CommentItem>({
    apiEndpoint: '/api/user/comments',
    limit: 10,
    transform: transformCommentItem,
    onSuccess: (data) => {
      console.log('📡 API 응답 데이터:', data);
    },
    onError: (error) => {
      console.error('댓글 조회 에러:', error);
    }
  });

  // 콘텐츠 축약 함수
  const truncateContent = (content: string | any, maxLength: number = 150) => {
    if (!content) return '';
    
    // content가 문자열이 아닌 경우 처리
    if (typeof content !== 'string') {
      try {
        if (content && Array.isArray(content.ops)) {
          const plainText = content.ops
            .map((op: any) => typeof op.insert === 'string' ? op.insert : '')
            .join('')
            .trim();
          content = plainText;
        } else if (typeof content === 'object') {
          content = JSON.stringify(content);
        } else {
          content = String(content);
        }
      } catch (error) {
        console.warn('콘텐츠 파싱 에러:', error);
        return '';
      }
    }

    // HTML 태그 제거 및 정리
    const cleanText = content
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    if (cleanText.length <= maxLength) {
      return cleanText;
    }

    // 자연스러운 절단점 찾기
    const cutPoint = cleanText.lastIndexOf(' ', maxLength) || cleanText.lastIndexOf('.', maxLength);
    return cutPoint > maxLength / 2 ? cleanText.substring(0, cutPoint) + '...' : cleanText.substring(0, maxLength) + '...';
  };

  // 헤더 설정
  const headerConfig: MypageHeaderConfig = {
    title: t('page_title_my_comments'),
    icon: '💬',
    backUrl: '/mypage',
    backLabel: t('label_back_to_mypage')
  };

  // 통계 카드 설정
  const statisticsCards: StatisticCard[] = [
    {
      id: 'primary',
      title: t('label_total_comments_count'),
      value: totalCount,
      description: t('label_comments_description'),
      icon: '📊',
      bgColor: 'from-primary-50 to-primary-100',
      borderColor: 'border-primary-200/50',
      textColor: 'text-primary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'secondary',
      title: t('label_total_likes'),
      value: statistics?.totalLikes || 0,
      description: t('label_likes_description'),
      icon: '👍',
      bgColor: 'from-secondary-50 to-secondary-100',
      borderColor: 'border-secondary-200/50',
      textColor: 'text-secondary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'point',
      title: t('label_popular_comment'),
      value: statistics?.totalPosts || 0,
      description: t('label_posts_description'),
      icon: '✨',
      bgColor: 'from-point-50 to-point-100',
      borderColor: 'border-point-200/50',
      textColor: 'text-point-800',
      isLoading: isLoading || isInitialLoad
    }
  ];

  // 빈 상태 설정
  const emptyStateConfig: EmptyStateConfig = {
    title: t('label_no_comments_yet'),
    description: t('label_write_first_comment'),
    actionLabel: t('label_go_to_board'),
    actionUrl: '/board',
    icon: '💬'
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
        {(isLoading || isInitialLoad) && comments.length === 0 && !error && (
          <InitialLoadingState translations={translations} />
        )}

        {/* 빈 상태 */}
        {isEmpty && (
          <EmptyState 
            config={emptyStateConfig}
            translations={translations}
          />
        )}

        {/* 댓글 리스트 */}
        <div className="space-y-4">
          {comments.map((comment, index) => (
            <div 
              key={comment.id} 
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
                  {/* 댓글 정보 */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-1">
                          {comment.postTitle || '게시글 제목'}
                        </h3>
                        <div className="h-0.5 w-12 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      {comment.isAnonymous && (
                        <div className="flex-shrink-0 ml-4">
                          <span className="px-2 py-1 text-xs font-semibold rounded-lg border bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-700">
                            {t('label_anonymous')}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 댓글 내용 미리보기 */}
                    <div className="mb-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">💬</span>
                          </div>
                          <span className="font-bold text-gray-800 text-sm">{t('label_comment_content')}</span>
                        </div>
                        <div className="text-gray-700 text-sm leading-relaxed">
                          {truncateContent(comment.content)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* 좋아요 수 */}
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-primary to-point rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">👍</span>
                          </div>
                          <span className="font-bold text-primary-800 text-sm">{t('label_likes')}</span>
                        </div>
                        <span className="text-gray-900 font-bold text-lg">{comment.likeCount.toLocaleString()}</span>
                      </div>
                      
                      {/* 게시판 */}
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-xl p-3 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-sub to-secondary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📋</span>
                          </div>
                          <span className="font-bold text-sub-800 text-sm">{t('label_board')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{comment.boardName}</span>
                      </div>

                      {/* 작성일 */}
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-xl p-3 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📅</span>
                          </div>
                          <span className="font-bold text-secondary-800 text-sm">{t('label_comment_date')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-sm">{formatDate(comment.createdAt)}</span>
                      </div>

                      {/* 원글 보기 */}
                      <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📄</span>
                          </div>
                          <span className="font-bold text-point-800 text-sm">{t('label_view_original_post')}</span>
                        </div>
                        <Link 
                          href={`/board/post/${comment.postId}`}
                          className="inline-flex items-center space-x-1 px-2 py-1 bg-white/80 text-point-800 rounded-lg text-xs font-semibold shadow-sm border border-point-200/50 hover:bg-point-50 transition-colors duration-200"
                        >
                          <span>보기</span>
                          <span>→</span>
                        </Link>
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