'use client';

import React, { useCallback } from 'react';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { InitialLoadingState, ErrorState, EmptyState, InfiniteScrollTrigger } from '@/components/mypage/MypageStates';
import { User } from '@supabase/supabase-js';
import type { Tables } from '@/types/supabase';
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

interface PostsClientProps {
  initialUser: User;
}

export default function PostsClient({ initialUser }: PostsClientProps) {
  const { 
    formatDate,  // timezone 기반 절대시간 포맷터
    getLocalizedText 
  } = useLanguage();
  const { t, tDynamic, translations } = useTranslations();

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

  // 콘텐츠 축약 함수 (언어 감지 추가)
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

  return (
    <div className="container mx-auto px-4 py-6">
      {/* 헤더 */}
      <MypageHeader 
        config={{
          title: t('page_title_my_posts'),
          icon: '📝',
          backUrl: '/mypage',
          backLabel: t('label_back_to_mypage')
        }}
        statistics={[
          {
            id: 'primary',
            title: t('label_total_posts_count'),
            value: totalCount || 0,
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
        ]}
        translations={translations}
      />

      {/* 메인 콘텐츠 */}
      <div className="space-y-6">
        {/* 로딩 상태 */}
        {isInitialLoad && (
          <InitialLoadingState translations={translations} />
        )}

        {/* 에러 상태 */}
        {error && !isInitialLoad && (
          <ErrorState 
            error={error}
            onRetry={retry}
            translations={translations}
          />
        )}

        {/* 빈 상태 */}
        {isEmpty && !isInitialLoad && (
          <EmptyState 
            config={{
              title: t('label_no_posts'),
              description: t('label_no_posts_description'),
              actionLabel: t('label_go_to_board'),
              actionUrl: '/vote',
              icon: '📝'
            }}
            translations={translations}
          />
        )}

        {/* 게시물 목록 */}
        {posts.length > 0 && (
          <div className="space-y-6">
            {posts.map((post, index) => {
              const truncatedContent = truncateContent(post.content);
              
              return (
                <div key={`${post.id}-${index}`} className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 overflow-hidden group">
                  <div className="p-6">
                    <div className="space-y-4">
                      {/* 게시물 제목 */}
                      <div className="mb-3">
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-3 border border-blue-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">📝</span>
                            </div>
                            <span className="font-bold text-blue-800 text-sm">{t('label_post_title')}</span>
                          </div>
                          <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors duration-200">
                            {post.title || t('label_no_title')}
                          </h3>
                        </div>
                      </div>

                      {/* 게시물 내용 (언어 감지 적용) */}
                      <div className="mb-3">
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-white text-xs">📄</span>
                              </div>
                              <span className="font-bold text-gray-800 text-sm">{t('label_post_content')}</span>
                            </div>

                          </div>
                          <div className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">
                            {truncatedContent || t('label_content_preview_two_lines')}
                          </div>
                        </div>
                      </div>

                      {/* 게시판 정보 및 통계 */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* 게시판 */}
                        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-3 border border-green-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">🏷️</span>
                            </div>
                            <span className="font-bold text-green-800 text-sm">{t('label_board')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">
                            {post.boardName || t('label_unknown')}
                          </span>
                        </div>

                        {/* 조회수 */}
                        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-3 border border-purple-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-purple-500 to-violet-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">👁️</span>
                            </div>
                            <span className="font-bold text-purple-800 text-sm">{t('views')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">{post.viewCount?.toLocaleString()}</span>
                        </div>

                        {/* 댓글 수 */}
                        <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-3 border border-orange-200/50">
                          <div className="flex items-center space-x-2 mb-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-orange-500 to-red-600 rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">💬</span>
                            </div>
                            <span className="font-bold text-orange-800 text-sm">{t('comments')}</span>
                          </div>
                          <span className="text-gray-900 font-semibold text-sm">{post.commentCount?.toLocaleString()}</span>
                        </div>
                      </div>

                      {/* 작성일 (개선된 날짜 표시) */}
                      <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                              <span className="text-white text-xs">📅</span>
                            </div>
                            <span className="font-bold text-point-800 text-sm">{t('label_post_date')}</span>
                          </div>
                          {/* 익명 표시 */}
                          {post.isAnonymous && (
                            <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                              {t('label_anonymous')}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          <span className="text-gray-900 font-semibold text-sm block">
                            {formatDate(post.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

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