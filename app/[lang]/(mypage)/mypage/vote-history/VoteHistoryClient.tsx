'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCdnImageUrl } from '@/utils/api/image';
import { hasValidLocalizedString } from '@/utils/api/strings';

// 다국어 객체 타입 정의
type MultiLanguageText = {
  en: string;
  ko: string;
} | string;

interface VoteHistoryItem {
  id: string;
  voteId: number;
  voteItemId: number;
  amount: number;
  createdAt: string;
  vote: {
    id: number;
    title: MultiLanguageText;
    startAt: string;
    stopAt: string;
    mainImage: string | null;
    area: string;
    voteCategory: MultiLanguageText;
  } | null;
  voteItem: {
    id: number;
    artistId: number;
    groupId: number;
    artist: {
      id: number;
      name: MultiLanguageText;
      image: string | null;
      artistGroup: {
        id: number;
        name: MultiLanguageText;
      } | null;
    } | null;
  } | null;
}

interface VoteHistoryResponse {
  success: boolean;
  data: VoteHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
  };
  statistics: {
    totalStarCandyUsed: number;
    totalSupportedArtists: number;
  };
}

interface Translations {
  label_mypage_my_votes: string;
  label_loading: string;
  label_no_votes: string;
  label_load_more: string;
  label_vote_amount: string;
  label_vote_date: string;
  label_vote_category: string;
  label_artist_name: string;
  label_group_name: string;
  label_vote_title: string;
  label_error_occurred: string;
  label_retry: string;
  label_no_more_votes: string;
  label_star_candy: string;
  label_back_to_mypage: string;
  label_total_vote_count: string;
  label_vote_status_ongoing: string;
  label_vote_status_ended: string;
  label_vote_status_upcoming: string;
  label_no_title: string;
  label_unknown: string;
  label_group_separator: string;
  label_artist: string;
  label_scroll_for_more: string;
  label_all_votes_checked: string;
  // 새로 추가되는 번역 키들
  label_total_votes_count: string;
  label_total_star_candy_used: string;
  label_supported_artists: string;
  label_please_try_again: string;
  label_loading_vote_history: string;
  label_no_vote_history_yet: string;
  label_vote_for_favorite_artist: string;
  label_go_to_vote: string;
  label_all_vote_history_checked: string;
}

interface VoteHistoryClientProps {
  initialUser: User;
  translations: Translations;
}

export default function VoteHistoryClient({ initialUser, translations }: VoteHistoryClientProps) {
  const [voteHistory, setVoteHistory] = useState<VoteHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [statistics, setStatistics] = useState({ totalStarCandyUsed: 0, totalSupportedArtists: 0 });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pathname = usePathname();

  const t = (key: keyof Translations) => translations[key] || key;

  // 현재 언어 추출 (모든 지원 언어 포함)
  const getCurrentLanguage = useCallback((): 'en' | 'ko' | 'ja' | 'zh' | 'id' => {
    const lang = pathname.split('/')[1];
    // 지원하는 언어인지 확인하고 적절한 값 반환
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

  // 🛡️ 최강 방어형 다국어 텍스트 처리 함수 (로깅 최소화)
  const getLocalizedText = useCallback((text: any): string => {
    try {
      // Step 1: null, undefined, 빈 값 처리
      if (text === null || text === undefined || text === '') {
        return '';
      }
      
      // Step 2: 이미 문자열인 경우
      if (typeof text === 'string') {
        return text;
      }
      
      // Step 3: 숫자나 불린값 처리
      if (typeof text === 'number' || typeof text === 'boolean') {
        return String(text);
      }
      
      // Step 4: 배열 처리 (예상치 못한 케이스)
      if (Array.isArray(text)) {
        return text.length > 0 ? String(text[0]) : '';
      }
      
      // Step 5: React 컴포넌트나 특수 객체 감지
      if (text.$$typeof || text._owner || text.type || text.props) {
        console.error('🚨 React 컴포넌트 감지! 강제 변환:', text);
        return '[React Element Detected]';
      }
      
      // Step 6: 일반 객체 처리 (다국어 객체)
      if (typeof text === 'object' && text !== null) {
        const currentLang = getCurrentLanguage();
        
        let result: any = '';
        
        // 우선순위: 현재언어 > 영어 > 한국어 > 첫번째값
        if (text[currentLang] !== undefined && text[currentLang] !== null) {
          result = text[currentLang];
        } else if (text.en !== undefined && text.en !== null) {
          result = text.en;
        } else if (text.ko !== undefined && text.ko !== null) {
          result = text.ko;
        } else {
          // 객체의 첫 번째 non-null 값 찾기
          const keys = Object.keys(text);
          for (const key of keys) {
            if (text[key] !== null && text[key] !== undefined && text[key] !== '') {
              result = text[key];
              break;
            }
          }
        }
        
        // 재귀적으로 처리 (중첩 객체 대응)
        if (typeof result === 'object' && result !== null) {
          return getLocalizedText(result);
        }
        
        // 최종 문자열 변환
        return String(result || '');
      }
      
      // Step 7: 기타 모든 경우
      return String(text);
      
    } catch (error) {
      console.error('💥 getLocalizedText 치명적 오류:', {
        error: error instanceof Error ? error.message : String(error),
        input: text,
        inputType: typeof text
      });
      
      // 최후의 수단
      try {
        return JSON.stringify(text);
      } catch {
        return '[처리 불가능한 데이터]';
      }
    }
  }, [getCurrentLanguage]);



  const fetchVoteHistory = useCallback(async (pageNum: number, reset: boolean = false) => {
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
      const response = await fetch(`/api/user/vote-history?page=${pageNum}&limit=10`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('투표 내역 조회에 실패했습니다.');
      }

      const data: VoteHistoryResponse = await response.json();

      if (data.success) {
        // 🐛 디버깅: API 응답 데이터 확인
        console.log('📡 API 응답 전체 데이터:', data);
        
        // 각 투표 항목의 이미지 URL 디버깅
        data.data.forEach((item, index) => {
          console.log(`📊 투표 항목 ${index + 1}:`, {
            id: item.id,
            artistName: item.voteItem?.artist?.name,
            artistImage: item.voteItem?.artist?.image,
            artistImageType: typeof item.voteItem?.artist?.image,
            hasArtist: !!item.voteItem?.artist,
            hasVoteItem: !!item.voteItem
          });
        });

        // 데이터 안전성 검증 및 정제
        const safeData = data.data.map((item) => {
          return {
            ...item,
            vote: item.vote ? {
              ...item.vote,
              title: typeof item.vote.title === 'object' 
                ? item.vote.title 
                : (item.vote.title || '제목 없음'),
              voteCategory: typeof item.vote.voteCategory === 'object' 
                ? item.vote.voteCategory 
                : (item.vote.voteCategory || '')
            } : null,
            voteItem: item.voteItem ? {
              ...item.voteItem,
              artist: item.voteItem.artist ? {
                ...item.voteItem.artist,
                name: typeof item.voteItem.artist.name === 'object'
                  ? item.voteItem.artist.name
                  : (item.voteItem.artist.name || '알 수 없음'),
                artistGroup: item.voteItem.artist.artistGroup ? {
                  ...item.voteItem.artist.artistGroup,
                  name: typeof item.voteItem.artist.artistGroup.name === 'object'
                    ? item.voteItem.artist.artistGroup.name
                    : (item.voteItem.artist.artistGroup.name || '')
                } : null
              } : null
            } : null
          };
        });
        
        setVoteHistory(prev => {
          return reset ? safeData : [...prev, ...safeData];
        });
        setTotalCount(data.pagination.totalCount);
        setHasMore(data.pagination.hasNext);
        setStatistics(data.statistics);
        
        // 페이지 번호 업데이트
        if (!reset) {
          setPage(pageNum);
        }
      } else {
        throw new Error('투표 내역 조회에 실패했습니다.');
      }
    } catch (err) {
      // AbortError는 무시
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('투표 내역 조회 에러:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // 초기 데이터 로드
  useEffect(() => {
    fetchVoteHistory(1, true);
  }, []);

  // 무한 스크롤 처리 (개선된 버전)
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
          fetchVoteHistory(nextPage, false);
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
  }, [hasMore, isLoading, isLoadingMore, page, fetchVoteHistory]);

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
    
    // 언어별 로케일로 날짜 포맷팅
    const formattedDate = date.toLocaleString(locale, options);
    
    // 모든 언어에서 KST로 통일 (한국 서비스)
    return `${formattedDate} KST`;
  };

  const getVoteStatus = (startAt: string, stopAt: string) => {
    const now = new Date();
    const start = new Date(startAt);
    const stop = new Date(stopAt);

    if (now < start) return { status: 'upcoming', color: 'text-blue-600 bg-blue-100' };
    if (now >= start && now <= stop) return { status: 'ongoing', color: 'text-green-600 bg-green-100' };
    return { status: 'ended', color: 'text-gray-600 bg-gray-100' };
  };

  const retry = () => {
    setError(null);
    setVoteHistory([]);
    setPage(1);
    setHasMore(true);
    fetchVoteHistory(1, true);
  };

  // 안전한 이미지 에러 핸들러
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target as HTMLImageElement;
    target.src = '/images/default-artist.png';
    target.onerror = null;
  }, []);

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
                      <span className="text-white text-xl">🗳️</span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sub to-point rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary-600 to-point bg-clip-text text-transparent leading-tight">
                      {t('label_mypage_my_votes')}
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
              
              {/* 통계 정보 - 추후 별도 API로 구현 예정 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-primary-50 to-primary-100 rounded-2xl p-4 border border-primary-200/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                      <span className="text-white text-sm">📊</span>
                    </div>
                    <div>
                      <p className="text-primary-800 font-bold text-lg">{totalCount.toLocaleString()}</p>
                      <p className="text-primary-600 text-xs font-medium">{t('label_total_votes_count')}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-2xl p-4 border border-secondary-200/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-secondary rounded-xl flex items-center justify-center">
                      <span className="text-white text-sm">⭐</span>
                    </div>
                    <div>
                      <p className="text-secondary-800 font-bold text-lg">
                        {statistics.totalStarCandyUsed.toLocaleString()}
                      </p>
                      <p className="text-secondary-600 text-xs font-medium">{t('label_total_star_candy_used')}</p>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-br from-point-50 to-point-100 rounded-2xl p-4 border border-point-200/50">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-point rounded-xl flex items-center justify-center">
                      <span className="text-white text-sm">🎯</span>
                    </div>
                    <div>
                      <p className="text-point-800 font-bold text-lg">
                        {statistics.totalSupportedArtists}
                      </p>
                      <p className="text-point-600 text-xs font-medium">{t('label_supported_artists')}</p>
                    </div>
                  </div>
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
        {isLoading && voteHistory.length === 0 && (
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
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl">🗳️</div>
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
                
                <p className="text-gray-600 font-medium">{t('label_loading_vote_history')}</p>
              </div>
            </div>
          </div>
        )}

        {/* 빈 상태 - 테마 색상 개선 */}
        {voteHistory.length === 0 && !isLoading && !error && (
          <div className="text-center py-20">
            <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-16 shadow-2xl border border-white/30 max-w-lg mx-auto">
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-2xl opacity-50"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-xl opacity-60"></div>
              
              <div className="relative z-10">
                <div className="relative mb-8">
                  <div className="w-28 h-28 bg-gradient-to-br from-primary-100 via-secondary-100 to-point-100 rounded-full flex items-center justify-center mx-auto animate-bounce shadow-lg">
                    <span className="text-5xl">🗳️</span>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-sub to-point rounded-full animate-ping opacity-60"></div>
                </div>
                
                <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-point bg-clip-text text-transparent mb-4">
                  {t('label_no_votes')}
                </h3>
                
                <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                  {t('label_no_vote_history_yet')}<br />
                  {t('label_vote_for_favorite_artist')}
                </p>
                
                <Link 
                  href="/vote"
                  className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-primary to-primary-600 text-white rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                >
                  <span>{t('label_go_to_vote')}</span>
                  <span className="text-lg">🚀</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 투표 내역 리스트 - 테마 색상 고도화 */}
        <div className="space-y-8">
          {voteHistory.map((item, index) => (
            <div 
              key={item.id} 
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
                <div className="flex items-start space-x-8">
                  {/* 아티스트 이미지 - 개선된 디자인 */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="w-24 h-24 rounded-3xl overflow-hidden bg-gradient-to-br from-primary-100 to-secondary-100 shadow-xl group-hover:shadow-2xl transition-all duration-500 border-2 border-white/50">
                        <img
                          src={getCdnImageUrl(item.voteItem?.artist?.image, 150) || '/images/default-artist.png'}
                          alt={getLocalizedText(item.voteItem?.artist?.name) || t('label_artist')}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          onError={handleImageError}
                        />
                      </div>
                      {/* 호버시 나타나는 글로우 효과 */}
                      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-primary/20 to-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                      {/* 투표 상태 인디케이터 */}
                      <div className="absolute -bottom-2 -right-2 w-6 h-6 bg-gradient-to-r from-sub to-point rounded-full flex items-center justify-center shadow-lg">
                        <span className="text-white text-xs">✓</span>
                      </div>
                    </div>
                  </div>

                  {/* 투표 정보 - 전면 개선 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-2">
                          {getLocalizedText(item.vote?.title) || t('label_no_title')}
                        </h3>
                        <div className="h-1 w-16 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      {item.vote && (
                        <div className="flex-shrink-0 ml-6">
                          <span className={`px-4 py-2 text-sm font-semibold rounded-full border ${
                            getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' 
                              ? 'bg-gradient-to-r from-green-500 to-secondary text-white border-green-600' :
                            getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' 
                              ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-700' :
                              'bg-gradient-to-r from-blue-500 to-primary text-white border-blue-600'
                          }`}>
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' && t('label_vote_status_ongoing')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' && t('label_vote_status_ended')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'upcoming' && t('label_vote_status_upcoming')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 아티스트 정보 - 대폭 개선 */}
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-2xl p-6 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                        <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-8 h-8 bg-gradient-to-r from-primary to-point rounded-xl flex items-center justify-center shadow-sm">
                            <span className="text-white text-sm">🎤</span>
                          </div>
                          <span className="font-bold text-primary-800">{t('label_artist_name')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-gray-900 text-lg">{getLocalizedText(item.voteItem?.artist?.name) || t('label_unknown')}</span>
                          {item.voteItem?.artist?.artistGroup && 
                           hasValidLocalizedString(item.voteItem?.artist?.artistGroup?.name) && (
                            <>
                              <span className="text-primary-400 font-bold">{t('label_group_separator')}</span>
                              <span className="text-primary-700 font-medium">{getLocalizedText(item.voteItem?.artist?.artistGroup?.name)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* 투표 금액 - 대폭 개선 */}
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-2xl p-6 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                        <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-8 h-8 bg-gradient-to-r from-sub to-secondary rounded-xl flex items-center justify-center shadow-sm">
                            <span className="text-white text-sm">💰</span>
                          </div>
                          <span className="font-bold text-sub-800">{t('label_vote_amount')}</span>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="relative">
                            <img 
                              src="/images/star-candy/star_100.png" 
                              alt={t('label_star_candy')} 
                              className="w-7 h-7 shadow-lg" 
                            />
                          </div>
                          <span className="text-2xl font-bold bg-gradient-to-r from-sub to-secondary bg-clip-text text-transparent">
                            {item.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* 투표 날짜 - 대폭 개선 */}
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-2xl p-6 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                        <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-3 mb-3">
                          <div className="w-8 h-8 bg-gradient-to-r from-secondary to-primary rounded-xl flex items-center justify-center shadow-sm">
                            <span className="text-white text-sm">📅</span>
                          </div>
                          <span className="font-bold text-secondary-800">{t('label_vote_date')}</span>
                        </div>
                        <span className="text-gray-900 font-semibold text-lg">{formatDate(item.createdAt)}</span>
                      </div>

                      {/* 투표 카테고리 - 대폭 개선 */}
                      {item.vote?.voteCategory && (
                        <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-2xl p-6 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                          <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                          <div className="flex items-center space-x-3 mb-3">
                            <div className="w-8 h-8 bg-gradient-to-r from-point to-sub rounded-xl flex items-center justify-center shadow-sm">
                              <span className="text-white text-sm">🏷️</span>
                            </div>
                            <span className="font-bold text-point-800">{t('label_vote_category')}</span>
                          </div>
                          <span className="inline-flex items-center px-4 py-2 bg-white/80 text-point-800 rounded-xl text-sm font-semibold shadow-sm border border-point-200/50">
                            {getLocalizedText(item.vote?.voteCategory)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 트리거 - 테마 색상 개선 */}
        {hasMore && (
          <div ref={sentinelRef} className="mt-16 text-center py-12">
            {(isLoading || isLoadingMore) ? (
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

        {/* 더 이상 로드할 데이터가 없는 경우 - 테마 색상 개선 */}
        {!hasMore && voteHistory.length > 0 && (
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
                  {t('label_all_votes_checked')}
                </h3>
                <p className="text-gray-600 text-lg">{t('label_all_vote_history_checked')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 