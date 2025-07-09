'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

interface PostsResponse {
  success: boolean;
  data: PostItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
  };
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
  label_total_posts_count: string;
  label_scroll_for_more: string;
  label_no_posts_description: string;
  views: string;
  label_title_comment: string;
  comments: string;
  label_anonymous: string;
  error_posts_fetch_failed: string;
  error_unknown: string;
}

interface PostsClientProps {
  initialUser: User;
  translations: Translations;
}

export default function PostsClient({ initialUser, translations }: PostsClientProps) {
  const [posts, setPosts] = useState<PostItem[]>([]);
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

  const fetchPosts = useCallback(async (pageNum: number, reset: boolean = false) => {
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
      const response = await fetch(`/api/user/posts?page=${pageNum}&limit=10`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(t('error_posts_fetch_failed'));
      }

      const data: PostsResponse = await response.json();

      if (data.success) {
        setPosts(prev => {
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
        throw new Error(t('error_posts_fetch_failed'));
      }
    } catch (err) {
      // AbortError는 무시
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('포스트 내역 조회 에러:', err);
      setError(err instanceof Error ? err.message : t('error_unknown'));
      
      // 초기 로딩 중 에러 발생 시에도 초기 로딩 상태 해제
      if (isInitialLoad) {
        setIsInitialLoad(false);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [isInitialLoad, t]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchPosts(1, true);
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
          fetchPosts(nextPage, false);
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
  }, [hasMore, isLoading, isLoadingMore, page, fetchPosts]);

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
      default:
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
    setPosts([]);
    setPage(1);
    setHasMore(false); // 초기 상태로 리셋
    setIsInitialLoad(true); // 초기 로딩 상태로 리셋
    fetchPosts(1, true);
  };

  const truncateContent = (content: string | any, maxLength: number = 100) => {
    // content가 문자열이 아닌 경우 (Quill Delta 형식 등)
    if (typeof content !== 'string') {
      try {
        // Quill Delta 형식인 경우 텍스트만 추출
        if (content && Array.isArray(content.ops)) {
          const plainText = content.ops
            .map((op: any) => typeof op.insert === 'string' ? op.insert : '')
            .join('');
          return plainText.length <= maxLength ? plainText : plainText.substring(0, maxLength) + '...';
        }
        
        // JSON 객체인 경우 문자열로 변환 시도
        if (typeof content === 'object') {
          const jsonString = JSON.stringify(content);
          const plainText = jsonString.replace(/[{}",]/g, ' ').trim();
          return plainText.length <= maxLength ? plainText : plainText.substring(0, maxLength) + '...';
        }
        
        // 기타 경우 빈 문자열 반환
        return '';
      } catch (error) {
        console.warn('콘텐츠 파싱 오류:', error);
        return '';
      }
    }
    
    // 일반 문자열인 경우 기존 로직 사용
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 헤더 */}
        <div className="mb-8">
          <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-8 shadow-xl border border-white/30 overflow-hidden">
            {/* 배경 데코레이션 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-3xl opacity-30"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-2xl opacity-40"></div>
            
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-primary-500 to-secondary-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <span className="text-3xl">📝</span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                      {t('page_title_my_posts')}
                    </h1>
                    <p className="text-gray-600 mt-1">
                      {totalCount > 0 ? `${totalCount.toLocaleString()} ${t('label_total_posts_count')}` : ''}
                    </p>
                  </div>
                </div>
                
                <Link 
                  href="/mypage" 
                  className="px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
                >
                  {t('label_back_to_mypage')}
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* 에러 상태 */}
        {error && (
          <div className="mb-8 p-6 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="text-2xl">⚠️</span>
                <div>
                  <h3 className="font-semibold text-red-800">{t('label_error_occurred')}</h3>
                  <p className="text-red-600">{error}</p>
                </div>
              </div>
              <button
                onClick={retry}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {t('label_retry')}
              </button>
            </div>
          </div>
        )}

        {/* 로딩 상태 */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
              <span className="text-gray-600">{t('label_loading_posts')}</span>
            </div>
          </div>
        )}

        {/* 포스트 목록 */}
        {!isLoading && posts.length > 0 && (
          <div className="space-y-4 mb-8">
            {posts.map((post) => (
              <div
                key={post.id}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                      {post.title}
                    </h3>
                    <p className="text-gray-600 mb-3 line-clamp-3">
                      {truncateContent(post.content)}
                    </p>
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <span>{post.boardName}</span>
                      <span>•</span>
                      <span>{formatDate(post.createdAt)}</span>
                      <span>•</span>
                      <span>{t('views')}: {post.viewCount.toLocaleString()}</span>
                      <span>•</span>
                      <span>{t('comments')}: {post.commentCount.toLocaleString()}</span>
                      {post.isAnonymous && (
                        <>
                          <span>•</span>
                          <span className="text-orange-600">{t('label_anonymous')}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 빈 상태 - 초기 로딩 완료 후에만 표시 */}
        {!isInitialLoad && !isLoading && posts.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gradient-to-r from-primary-100 to-secondary-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">📝</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('label_no_posts')}
            </h3>
            <p className="text-gray-600 mb-6">
              {t('label_no_posts_description')}
            </p>
          </div>
        )}

        {/* 더 로드하기 버튼 및 무한 스크롤 - 초기 로딩 완료 후이고 데이터가 있을 때만 표시 */}
        {!isInitialLoad && posts.length > 0 && hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-8">
            {isLoadingMore ? (
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                <span className="text-gray-600">{t('label_loading')}</span>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">{t('label_scroll_for_more')}</div>
            )}
          </div>
        )}

        {/* 모든 데이터 로드 완료 - 초기 로딩 완료 후에만 표시 */}
        {!isInitialLoad && posts.length > 0 && !hasMore && !isLoadingMore && (
          <div className="text-center py-8">
            <div className="text-gray-500 text-sm">{t('label_all_posts_checked')}</div>
          </div>
        )}
      </div>
    </div>
  );
} 