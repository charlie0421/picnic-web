'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface CommentItem {
  id: string;
  content: string;
  createdAt: string;
  postTitle: string;
  postId: string;
  boardName: string | null;
  isAnonymous: boolean;
  likeCount?: number;
}

interface CommentsResponse {
  success: boolean;
  data: CommentItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
  };
}

interface Translations {
  page_title_my_comments: string;
  label_loading: string;
  label_no_comments: string;
  label_load_more: string;
  label_comment_content: string;
  label_comment_date: string;
  label_comment_post_title: string;
  label_error_occurred: string;
  label_retry: string;
  label_back_to_mypage: string;
  label_please_try_again: string;
  label_loading_comments: string;
  label_all_comments_checked: string;
  label_unknown: string;
  label_anonymous: string;
  label_scroll_for_more: string;
}

interface CommentsClientProps {
  initialUser: User;
  translations: Translations;
}

export default function CommentsClient({ initialUser, translations }: CommentsClientProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false); // 초기값을 false로 변경
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // 초기 로딩 상태 추가
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pathname = usePathname();

  const t = (key: keyof Translations) => translations[key] || key;

  // 현재 언어 추출
  const getCurrentLanguage = useCallback((): 'en' | 'ko' | 'ja' | 'zh' | 'id' => {
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

  const fetchComments = useCallback(async (pageNum: number, reset: boolean = false) => {
    // 이전 요청 취소
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // 새로운 AbortController 생성
    abortControllerRef.current = new AbortController();
    
    if (reset) {
      setIsLoading(true);
    } else {
      setIsLoadingMore(true);
    }
    setError(null);

    try {
      const response = await fetch(`/api/user/comments?page=${pageNum}&limit=10`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('댓글 내역 조회에 실패했습니다.');
      }

      const data: CommentsResponse = await response.json();

      if (data.success) {
        console.log('📡 API 응답 전체 데이터:', data);
        
        setComments(prev => {
          return reset ? data.data : [...prev, ...data.data];
        });
        setTotalCount(data.pagination.totalCount);
        setHasMore(data.pagination.hasNext);
        
        // 초기 로딩 완료 표시
        if (isInitialLoad) {
          setIsInitialLoad(false);
        }
        
        // 페이지 번호 업데이트
        if (!reset) {
          setPage(pageNum);
        }
      } else {
        throw new Error('댓글 내역 조회에 실패했습니다.');
      }
    } catch (err) {
      // AbortError는 무시
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('댓글 내역 조회 에러:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      
      // 초기 로딩 중 에러 발생 시에도 초기 로딩 상태 해제
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [isInitialLoad]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchComments(1, true);
  }, []);

  // 무한 스크롤 처리
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoading || isLoadingMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    
    // 기존 observer 정리
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          const nextPage = page + 1;
          fetchComments(nextPage, false);
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, isLoading, isLoadingMore, page, fetchComments]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const currentLang = getCurrentLanguage();
    
    // 언어별 로케일과 포맷팅 옵션 설정
    let locale: string;
    let options: Intl.DateTimeFormatOptions;
    
    switch (currentLang) {
      case 'ko':
        locale = 'ko-KR';
        options = {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        };
        break;
      case 'ja':
        locale = 'ja-JP';
        options = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        };
        break;
      case 'zh':
        locale = 'zh-CN';
        options = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        };
        break;
      case 'id':
        locale = 'id-ID';
        options = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        };
        break;
      default: // 'en'
        locale = 'en-US';
        options = {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Seoul'
        };
    }
    
    const formattedDate = date.toLocaleString(locale, options);
    return `${formattedDate} KST`;
  };

  const retry = () => {
    setError(null);
    setComments([]);
    setPage(1);
    setHasMore(false); // 초기 상태로 리셋
    setIsInitialLoad(true); // 초기 로딩 상태로 리셋
    fetchComments(1, true);
  };

  // 내용 요약 함수
  const truncateContent = (content: string, maxLength: number = 150) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 헤더 - 테마 색상 고도화 */}
        <div className="mb-8">
          <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-xl border border-white/30 overflow-hidden">
            {/* 배경 데코레이션 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-3xl opacity-30"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-2xl opacity-40"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-lg">
                      <span className="text-white text-xl">💬</span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sub to-point rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary-600 to-point bg-clip-text text-transparent leading-tight">
                      {t('page_title_my_comments')}
                    </h1>
                    <div className="h-1 w-20 bg-gradient-to-r from-primary to-point rounded-full mt-2"></div>
                  </div>
                </div>
                <Link 
                  href="/mypage"
                  className="group relative flex items-center space-x-3 px-6 py-3 bg-gradient-to-r from-primary to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <span className="font-medium">{t('label_back_to_mypage')}</span>
                  <span className="text-lg group-hover:translate-x-1 transition-transform">🏠</span>
                </Link>
              </div>

              {/* 통계 정보 */}
              {!isLoading && (
                <div className="bg-gradient-to-r from-white/50 to-white/30 rounded-2xl p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-center space-x-8">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-primary-600">{totalCount.toLocaleString()}</div>
                      <div className="text-sm text-gray-600 font-medium">총 댓글 수</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="space-y-6">
          {isLoading ? (
            // 로딩 상태
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-point rounded-full animate-spin animation-delay-75"></div>
              </div>
              <p className="mt-6 text-lg text-gray-600 font-medium">{t('label_loading_comments')}</p>
            </div>
          ) : error ? (
            // 에러 상태
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-24 h-24 bg-gradient-to-br from-point-100 to-point-200 rounded-full flex items-center justify-center mb-6">
                <span className="text-4xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">{t('label_error_occurred')}</h3>
              <p className="text-gray-600 mb-6 text-center max-w-md">{error}</p>
              <button
                onClick={retry}
                className="px-8 py-3 bg-gradient-to-r from-primary to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
              >
                {t('label_retry')}
              </button>
            </div>
          ) : !isInitialLoad && comments.length === 0 ? (
            // 데이터 없음 상태 - 초기 로딩 완료 후에만 표시
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-32 h-32 bg-gradient-to-br from-primary-50 via-secondary-50 to-point-50 rounded-full flex items-center justify-center mb-8">
                <span className="text-6xl opacity-50">💬</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">{t('label_no_comments')}</h3>
              <p className="text-gray-600 text-center max-w-md mb-6">
                작성한 댓글이 없습니다. 다른 사용자의 게시물에 댓글을 남겨보세요!
              </p>
            </div>
          ) : (
            // 댓글 목록
            <>
              <div className="grid gap-6">
                {comments.map((comment, index) => (
                  <div 
                    key={`${comment.id}-${index}`}
                    className="group relative bg-white/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
                  >
                    {/* 배경 그라데이션 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    <div className="relative z-10">
                      {/* 댓글 헤더 */}
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            {comment.isAnonymous && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                {t('label_anonymous')}
                              </span>
                            )}
                            {comment.boardName && (
                              <span className="px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded-full">
                                {comment.boardName}
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-medium text-gray-700 mb-2 group-hover:text-primary-600 transition-colors">
                            {t('label_comment_post_title')}: {comment.postTitle}
                          </h3>
                          <p className="text-gray-900 leading-relaxed">
                            {truncateContent(comment.content)}
                          </p>
                        </div>
                      </div>

                      {/* 댓글 정보 */}
                      <div className="flex items-center justify-between text-sm text-gray-500">
                        <div className="flex items-center space-x-4">
                          {comment.likeCount !== undefined && (
                            <div className="flex items-center space-x-1">
                              <span>❤️</span>
                              <span>{comment.likeCount.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-xs">
                          {formatDate(comment.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 무한 스크롤 센티넬 - 초기 로딩 완료 후이고 데이터가 있을 때만 표시 */}
              {!isInitialLoad && comments.length > 0 && (
                <div ref={sentinelRef} className="py-8">
                  {isLoadingMore ? (
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4"></div>
                      <p className="text-gray-600">{t('label_loading')}</p>
                    </div>
                  ) : hasMore ? (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-sm">{t('label_scroll_for_more')}</p>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-green-100 to-emerald-100 rounded-full">
                        <span className="text-green-600">✨</span>
                        <span className="text-green-700 font-medium">{t('label_all_comments_checked')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
} 