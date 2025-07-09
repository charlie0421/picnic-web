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
  statistics?: {
    totalViews: number;
    totalComments: number;
    popularPost?: PostItem;
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
  // 새로 추가된 번역 키들
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
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [statistics, setStatistics] = useState({ totalViews: 0, totalComments: 0 });
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
        
        // 통계 정보 설정
        if (data.statistics) {
          setStatistics(data.statistics);
        } else {
          // 로컬에서 통계 계산
          const totalViews = data.data.reduce((sum, post) => sum + post.viewCount, 0);
          const totalComments = data.data.reduce((sum, post) => sum + post.commentCount, 0);
          setStatistics({ totalViews, totalComments });
        }
        
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
      
      console.error(t('console_posts_fetch_error') + ':', err);
      setError(err instanceof Error ? err.message : t('error_unknown_occurred'));
      
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

  // 무한 스크롤 처리 (개선된 버전)
  useEffect(() => {
    if (!sentinelRef.current || !hasMore || isLoadingMore) {
      return;
    }

    const sentinel = sentinelRef.current;
    
    // 기존 observer 정리
    if (observerRef.current) {
      observerRef.current.disconnect();
    }
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
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
  }, [hasMore, isLoadingMore, page, fetchPosts]);

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
    setHasMore(false);
    setIsInitialLoad(true);
    fetchPosts(1, true);
  };

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
                      <span className="text-white text-xl">📝</span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sub to-point rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary-600 to-point bg-clip-text text-transparent leading-tight">
                      {t('page_title_my_posts')}
                    </h1>
                    <div className="h-1 w-20 bg-gradient-to-r from-primary to-point rounded-full mt-2"></div>
                  </div>
                </div>
                <Link 
                  href="/mypage"
                  className="group relative flex items-center space-x-3 px-6 py-3 bg-gradient-to-r from-primary to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
                >
                  <span className="text-sm font-semibold">{t('label_back_to_mypage')}</span>
                  <span className="group-hover:translate-x-1 transition-transform duration-300 text-lg">→</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </Link>
              </div>
              
              {/* 통계 정보 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-6 border border-primary-200/50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">📊</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-primary-800 text-lg">{t('label_total_posts_count')}</h3>
                      <p className="text-primary-600 text-sm">{t('label_posts_description') || '작성한 게시물 수'}</p>
                    </div>
                  </div>
                  <p className="text-primary-800 font-bold text-3xl">{totalCount.toLocaleString()}</p>
                </div>
                
                <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-2xl p-6 border border-secondary-200/50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">👁️</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-secondary-800 text-lg">{t('label_total_views')}</h3>
                      <p className="text-secondary-600 text-sm">{t('label_views_description') || '누적 조회수'}</p>
                    </div>
                  </div>
                  <p className="text-secondary-800 font-bold text-3xl">
                    {statistics.totalViews.toLocaleString()}
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-point-50 to-point-100 rounded-2xl p-6 border border-point-200/50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-point rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">💬</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-point-800 text-lg">{t('label_total_comments')}</h3>
                      <p className="text-point-600 text-sm">{t('label_comments_description') || '받은 댓글 수'}</p>
                    </div>
                  </div>
                  <p className="text-point-800 font-bold text-3xl">
                    {statistics.totalComments.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 오류 상태 - 테마 색상 개선 */}
        {error && (
          <div className="mb-6 relative">
            <div className="bg-gradient-to-r from-red-50 via-point-50 to-red-50 border border-red-200 rounded-2xl p-6 shadow-lg backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-10 h-10 bg-red-100 rounded-2xl flex items-center justify-center">
                    <span className="text-red-500 text-lg">⚠️</span>
                  </div>
                  <div>
                    <p className="text-red-800 font-semibold text-lg">{error}</p>
                    <p className="text-red-600 text-sm">{t('label_please_try_again')}</p>
                  </div>
                </div>
                <button
                  onClick={retry}
                  className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-medium"
                >
                  {t('label_retry')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 초기 로딩 상태 - 테마 색상 개선 */}
        {(isLoading || isInitialLoad) && posts.length === 0 && (
          <div className="text-center py-20">
            <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-16 shadow-2xl border border-white/30 max-w-md mx-auto">
              {/* 배경 애니메이션 */}
              <div className="absolute inset-0 bg-gradient-to-r from-primary-100/30 via-secondary-100/30 to-point-100/30 rounded-3xl animate-pulse"></div>
              
              <div className="relative z-10">
                {/* 개선된 로딩 스피너 */}
                <div className="relative mb-8">
                  <div className="w-20 h-20 rounded-full mx-auto relative">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-secondary animate-spin">
                      <div className="absolute inset-3 bg-white rounded-full"></div>
                    </div>
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-sub to-point animate-ping opacity-30"></div>
                  </div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl">📝</div>
                </div>
                
                <h3 className="text-2xl font-bold bg-gradient-to-r from-primary to-point bg-clip-text text-transparent mb-4">
                  {t('label_loading')}
                </h3>
                
                {/* 개선된 점프 애니메이션 */}
                <div className="flex space-x-2 justify-center mb-4">
                  <div className="w-3 h-3 bg-gradient-to-r from-primary to-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-3 h-3 bg-gradient-to-r from-secondary to-secondary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-3 h-3 bg-gradient-to-r from-sub to-sub-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  <div className="w-3 h-3 bg-gradient-to-r from-point to-point-600 rounded-full animate-bounce" style={{ animationDelay: '450ms' }}></div>
                </div>
                
                <p className="text-gray-600 font-medium">{t('label_loading_posts')}</p>
              </div>
            </div>
          </div>
        )}

        {/* 빈 상태 - 로딩이 완전히 끝난 후에만 표시 */}
        {!isLoading && !isInitialLoad && posts.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-16 shadow-2xl border border-white/30 max-w-lg mx-auto">
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-2xl opacity-50"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-xl opacity-60"></div>
              
              <div className="relative z-10">
                <div className="relative mb-8">
                  <div className="w-28 h-28 bg-gradient-to-br from-primary-100 via-secondary-100 to-point-100 rounded-full flex items-center justify-center mx-auto animate-bounce shadow-lg">
                    <span className="text-5xl">📝</span>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-sub to-point rounded-full animate-ping opacity-60"></div>
                </div>
                
                <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-point bg-clip-text text-transparent mb-4">
                  {t('label_no_posts')}
                </h3>
                
                <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                  {t('label_no_posts_description')}<br />
                  {t('label_write_first_post')}
                </p>
                
                <Link 
                  href="/vote"
                  className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-primary to-primary-600 text-white rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                >
                  <span>{t('label_go_to_board')}</span>
                  <span className="text-lg">✍️</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 게시물 리스트 - 테마 색상 고도화 */}
        <div className="space-y-8">
          {posts.map((post, index) => (
            <div 
              key={post.id} 
              className="group relative bg-white/90 backdrop-blur-md rounded-3xl shadow-lg hover:shadow-2xl border border-white/30 overflow-hidden transition-all duration-500 transform hover:scale-[1.02] hover:-translate-y-2"
              style={{
                animationDelay: `${index * 100}ms`
              }}
            >
              {/* 상단 그라데이션 바 - 개선 */}
              <div className="h-2 bg-gradient-to-r from-primary via-secondary via-sub to-point"></div>
              
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-20 h-20 bg-gradient-to-br from-primary-50 to-point-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div className="relative p-8">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-2">
                      {post.title}
                    </h3>
                    <div className="h-1 w-16 bg-gradient-to-r from-primary to-point rounded-full"></div>
                  </div>
                  {post.isAnonymous && (
                    <div className="flex-shrink-0 ml-6">
                      <span className="px-4 py-2 text-sm font-semibold rounded-full bg-gradient-to-r from-sub-500 to-point-500 text-white border border-sub-600">
                        {t('label_anonymous')}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 게시물 내용 - 2줄 제한 적용 */}
                  <div className="md:col-span-2 relative bg-gradient-to-br from-primary-50 to-point-50 rounded-2xl p-6 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="w-8 h-8 bg-gradient-to-r from-primary to-point rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">📝</span>
                      </div>
                      <span className="font-bold text-primary-800">{t('label_post_content')}</span>
                      <div className="flex-1"></div>
                      <span className="text-xs text-primary-600 bg-white/70 px-2 py-1 rounded-md font-medium">
                        {t('label_content_preview_two_lines')}
                      </span>
                    </div>
                    <div className="relative">
                      <p 
                        className="text-gray-800 leading-relaxed text-base whitespace-pre-line overflow-hidden"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          maxHeight: '3.2em', // 2줄의 높이 (line-height * 2)
                        }}
                      >
                        {truncateContent(post.content)}
                      </p>
                      {/* 그라데이션 fade-out 효과 */}
                      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-primary-50 to-transparent pointer-events-none"></div>
                    </div>
                  </div>
                  
                  {/* 조회수 - 대폭 개선 */}
                  <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-2xl p-6 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-sub to-secondary rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">👁️</span>
                      </div>
                      <span className="font-bold text-sub-800">{t('views')}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl font-bold bg-gradient-to-r from-sub to-secondary bg-clip-text text-transparent">
                        {post.viewCount.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* 댓글 수 - 대폭 개선 */}
                  <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-2xl p-6 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-secondary to-primary rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">💬</span>
                      </div>
                      <span className="font-bold text-secondary-800">{t('comments')}</span>
                    </div>
                    <span className="text-2xl font-bold bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">
                      {post.commentCount.toLocaleString()}
                    </span>
                  </div>

                  {/* 게시판명 - 대폭 개선 */}
                  <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-2xl p-6 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-point to-sub rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">📋</span>
                      </div>
                      <span className="font-bold text-point-800">{t('label_board')}</span>
                    </div>
                    <span className="inline-flex items-center px-4 py-2 bg-white/80 text-point-800 rounded-xl text-sm font-semibold shadow-sm border border-point-200/50">
                      {post.boardName}
                    </span>
                  </div>

                  {/* 작성 날짜 - 대폭 개선 */}
                  <div className="relative bg-gradient-to-br from-primary-50 to-secondary-50 rounded-2xl p-6 group-hover:from-primary-100 group-hover:to-secondary-100 transition-all duration-300 border border-primary-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-primary-200 to-secondary-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-primary to-secondary rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">📅</span>
                      </div>
                      <span className="font-bold text-primary-800">{t('label_post_date')}</span>
                    </div>
                    <span className="text-gray-900 font-semibold text-lg">{formatDate(post.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 트리거 - 초기 로딩 완료 후이고 데이터가 있을 때만 표시 */}
        {!isLoading && !isInitialLoad && posts.length > 0 && hasMore && (
          <div ref={sentinelRef} className="mt-16 text-center py-12">
            {isLoadingMore ? (
              <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-10 shadow-xl border border-white/30 max-w-sm mx-auto">
                <div className="absolute inset-0 bg-gradient-to-r from-primary-50/50 via-secondary-50/50 to-point-50/50 rounded-3xl animate-pulse"></div>
                <div className="relative z-10">
                  <div className="flex flex-col items-center space-y-6">
                    <div className="relative">
                      <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary via-secondary to-point animate-spin">
                        <div className="absolute inset-3 bg-white rounded-full"></div>
                      </div>
                      <div className="absolute inset-0 w-16 h-16 rounded-full bg-gradient-to-r from-primary via-secondary to-point animate-ping opacity-30"></div>
                    </div>
                    <div className="text-center">
                      <p className="text-gray-800 font-bold text-lg mb-2">{t('label_loading')}</p>
                      <div className="flex space-x-2 justify-center">
                        <div className="w-3 h-3 bg-gradient-to-r from-primary to-primary-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-3 h-3 bg-gradient-to-r from-secondary to-secondary-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-3 h-3 bg-gradient-to-r from-sub to-sub-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        <div className="w-3 h-3 bg-gradient-to-r from-point to-point-600 rounded-full animate-bounce" style={{ animationDelay: '450ms' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 border border-white/30 max-w-xs mx-auto shadow-lg">
                <div className="flex items-center justify-center space-x-3 text-gray-600">
                  <span className="animate-bounce text-2xl">👆</span>
                  <span className="font-medium">{t('label_scroll_for_more')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 더 이상 로드할 데이터가 없는 경우 - 초기 로딩 완료 후에만 표시 */}
        {!isLoading && !isInitialLoad && !hasMore && posts.length > 0 && (
          <div className="text-center py-16">
            <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-12 shadow-xl border border-white/30 max-w-lg mx-auto">
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-primary-100 to-secondary-100 rounded-full blur-2xl opacity-50"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 bg-gradient-to-tr from-sub-100 to-point-100 rounded-full blur-xl opacity-60"></div>
              
              <div className="relative z-10">
                <div className="w-20 h-20 bg-gradient-to-br from-secondary-100 via-sub-100 to-primary-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                  <span className="text-3xl">🎉</span>
                </div>
                <h3 className="text-2xl font-bold bg-gradient-to-r from-secondary via-sub to-primary bg-clip-text text-transparent mb-4">
                  {t('label_all_posts_checked')}
                </h3>
                <p className="text-gray-600 text-lg">{t('label_all_posts_loaded')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 