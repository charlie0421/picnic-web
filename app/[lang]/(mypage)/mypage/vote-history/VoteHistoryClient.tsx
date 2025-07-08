'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pathname = usePathname();

  const t = (key: keyof Translations) => translations[key] || key;

  // 현재 언어 추출
  const getCurrentLanguage = useCallback((): 'en' | 'ko' => {
    const lang = pathname.split('/')[1];
    return lang === 'ko' ? 'ko' : 'en';
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
    
    // 현재 언어에 따른 로케일 설정
    const locale = currentLang === 'ko' ? 'ko-KR' : 'en-US';
    
    // 시간대 정보를 포함한 포맷팅
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: currentLang === 'ko' ? 'long' : 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    };
    
    return date.toLocaleString(locale, options);
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
    const parent = target.parentElement;
    const originalUrl = target.src;
    
    console.warn('🚨 이미지 로딩 실패:', {
      originalUrl,
      error: e
    });
    
    if (parent) {
      // 이미 fallback이 시도된 경우 기본 아바타 표시
      if (target.dataset.fallbackAttempted === 'true') {
        target.style.display = 'none';
        const fallbackDiv = document.createElement('div');
        fallbackDiv.className = 'w-full h-full flex items-center justify-center text-gray-400 text-2xl';
        fallbackDiv.textContent = '👤';
        parent.appendChild(fallbackDiv);
        return;
      }

      // 프록시 이미지 시도 (구글 이미지 등 허용된 도메인의 경우)
      const isProxyCompatible = originalUrl.includes('googleusercontent.com') ||
                               originalUrl.includes('graph.facebook.com') ||
                               originalUrl.includes('pbs.twimg.com') ||
                               originalUrl.includes('cdn.discordapp.com') ||
                               originalUrl.includes('avatars.githubusercontent.com');

      if (isProxyCompatible && !originalUrl.includes('/api/proxy-image')) {
        console.log('🔄 프록시 이미지 시도:', originalUrl);
        target.dataset.fallbackAttempted = 'true';
        target.src = `/api/proxy-image?url=${encodeURIComponent(originalUrl)}`;
        return;
      }

      // 기본 아바타 표시
      target.style.display = 'none';
      const fallbackDiv = document.createElement('div');
      fallbackDiv.className = 'w-full h-full flex items-center justify-center text-gray-400 text-2xl';
      fallbackDiv.textContent = '👤';
      parent.appendChild(fallbackDiv);
    }
  }, []);

  // 이미지 URL 정리 함수
  const getCleanImageUrl = useCallback((url: string): string => {
    // URL에서 불필요한 파라미터 제거 및 정리
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https:${url}`);
      
      // 일부 공통 이미지 서비스의 크기 파라미터 최적화
      if (urlObj.hostname.includes('googleusercontent.com')) {
        urlObj.searchParams.set('s', '200'); // 적절한 크기로 조정
      }
      
      return urlObj.toString();
    } catch {
      return url;
    }
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 헤더 - 개선된 디자인 */}
        <div className="mb-8">
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <span className="text-white text-lg">🗳️</span>
                </div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {t('label_mypage_my_votes')}
                </h1>
              </div>
              <Link 
                href="/mypage"
                className="group flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                <span className="text-sm font-medium">{t('label_back_to_mypage')}</span>
                <span className="group-hover:translate-x-1 transition-transform duration-300">→</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <p className="text-gray-700 font-medium">
                {t('label_total_vote_count').replace('{count}', totalCount.toString())}
              </p>
            </div>
          </div>
        </div>

        {/* 오류 상태 - 개선된 디자인 */}
        {error && (
          <div className="mb-6 p-4 bg-gradient-to-r from-red-50 to-pink-50 border border-red-200 rounded-xl shadow-md backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-500">⚠️</span>
                </div>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
              <button
                onClick={retry}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all duration-300 transform hover:scale-105 shadow-md"
              >
                {t('label_retry')}
              </button>
            </div>
          </div>
        )}

        {/* 빈 상태 - 개선된 디자인 */}
        {voteHistory.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-12 shadow-xl border border-white/20 max-w-md mx-auto">
              <div className="relative mb-6">
                <div className="w-24 h-24 bg-gradient-to-r from-purple-100 to-pink-100 rounded-full flex items-center justify-center mx-auto animate-bounce">
                  <span className="text-4xl">🗳️</span>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-full animate-ping"></div>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">아직 투표 내역이 없어요</h3>
              <p className="text-gray-600 mb-6">{t('label_no_votes')}</p>
              <div className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
                <span className="mr-2">✨</span>
                <span className="font-medium">첫 투표 참여하기</span>
              </div>
            </div>
          </div>
        )}

        {/* 투표 내역 리스트 - 개선된 카드 디자인 */}
        <div className="space-y-6">
          {voteHistory.map((item, index) => (
            <div 
              key={item.id} 
              className="group bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg hover:shadow-2xl border border-white/20 overflow-hidden transition-all duration-500 transform hover:scale-[1.02] hover:-translate-y-1"
              style={{
                animationDelay: `${index * 100}ms`
              }}
            >
              {/* 상단 그라데이션 바 */}
              <div className="h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500"></div>
              
              <div className="p-6">
                <div className="flex items-start space-x-6">
                  {/* 아티스트 이미지 - 개선된 디자인 */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 shadow-lg group-hover:shadow-xl transition-all duration-300">
                        {(() => {
                          const imageUrl = item.voteItem?.artist?.image;
                          
                          const isValidImageUrl = (url: string | null | undefined): boolean => {
                            if (!url || typeof url !== 'string' || url.trim() === '') {
                              return false;
                            }
                            
                            const cleanUrl = url.trim();
                            
                            return (
                              cleanUrl.startsWith('http://') ||
                              cleanUrl.startsWith('https://') ||
                              cleanUrl.startsWith('/') ||
                              cleanUrl.includes('supabase') ||
                              cleanUrl.includes('cloudflare') ||
                              cleanUrl.includes('amazonaws') ||
                              cleanUrl.includes('googleusercontent') ||
                              cleanUrl.includes('cdn') ||
                              cleanUrl.startsWith('./') ||
                              cleanUrl.startsWith('../') ||
                              /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i.test(cleanUrl)
                            );
                          };
                          
                          if (isValidImageUrl(imageUrl)) {
                            const cleanUrl = getCleanImageUrl(imageUrl!);
                            
                            return (
                              <img
                                src={cleanUrl}
                                alt={getLocalizedText(item.voteItem?.artist?.name) || t('label_artist')}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                onError={handleImageError}
                              />
                            );
                          } else {
                            return (
                              <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl group-hover:scale-110 transition-transform duration-500">
                                👤
                              </div>
                            );
                          }
                        })()}
                      </div>
                      {/* 호버시 나타나는 글로우 효과 */}
                      <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-400/20 to-pink-400/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    </div>
                  </div>

                  {/* 투표 정보 - 개선된 레이아웃 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-4">
                      <h3 className="text-xl font-bold text-gray-900 truncate group-hover:text-purple-600 transition-colors duration-300">
                        {getLocalizedText(item.vote?.title) || t('label_no_title')}
                      </h3>
                      {item.vote && (
                        <div className="flex-shrink-0 ml-4">
                          <span className={`inline-flex items-center px-3 py-1 text-sm font-semibold rounded-full shadow-md transition-all duration-300 transform group-hover:scale-105 ${
                            getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' 
                              ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white animate-pulse'
                              : getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended'
                              ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white'
                              : 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white'
                          }`}>
                            <span className="mr-1">
                              {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' && '🟢'}
                              {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' && '⭕'}
                              {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'upcoming' && '🔵'}
                            </span>
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ongoing' && t('label_vote_status_ongoing')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'ended' && t('label_vote_status_ended')}
                            {getVoteStatus(item.vote.startAt, item.vote.stopAt).status === 'upcoming' && t('label_vote_status_upcoming')}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {/* 아티스트 정보 */}
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 group-hover:from-purple-100 group-hover:to-pink-100 transition-all duration-300">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-purple-500">🎤</span>
                          <span className="font-semibold text-gray-700">{t('label_artist_name')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="font-medium text-gray-900">{getLocalizedText(item.voteItem?.artist?.name) || t('label_unknown')}</span>
                          {item.voteItem?.artist?.artistGroup && (
                            <>
                              <span className="text-gray-400">{t('label_group_separator')}</span>
                              <span className="text-gray-700">{getLocalizedText(item.voteItem?.artist?.artistGroup?.name)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {/* 투표 금액 */}
                      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-4 group-hover:from-yellow-100 group-hover:to-orange-100 transition-all duration-300">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-yellow-500">💰</span>
                          <span className="font-semibold text-gray-700">{t('label_vote_amount')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <img 
                            src="/images/star-candy/star_100.png" 
                            alt="별사탕" 
                            className="w-5 h-5 animate-spin" 
                            style={{ animationDuration: '3s' }}
                          />
                          <span className="text-lg font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent">
                            {item.amount.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* 투표 날짜 */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 group-hover:from-blue-100 group-hover:to-indigo-100 transition-all duration-300">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="text-blue-500">📅</span>
                          <span className="font-semibold text-gray-700">{t('label_vote_date')}</span>
                        </div>
                        <span className="text-gray-900 font-medium">{formatDate(item.createdAt)}</span>
                      </div>

                      {/* 투표 카테고리 */}
                      {item.vote?.voteCategory && (
                        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-4 group-hover:from-green-100 group-hover:to-emerald-100 transition-all duration-300">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-green-500">🏷️</span>
                            <span className="font-semibold text-gray-700">{t('label_vote_category')}</span>
                          </div>
                          <span className="inline-flex items-center px-3 py-1 bg-white/70 text-gray-800 rounded-lg text-sm font-medium shadow-sm">
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

        {/* 무한 스크롤 트리거 - 개선된 로딩 디자인 */}
        {hasMore && (
          <div ref={sentinelRef} className="mt-12 text-center py-8">
            {(isLoading || isLoadingMore) ? (
              <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-white/20 max-w-sm mx-auto">
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-spin">
                      <div className="absolute inset-2 bg-white rounded-full"></div>
                    </div>
                    <div className="absolute inset-0 w-12 h-12 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 animate-ping opacity-20"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-gray-700 font-medium">{t('label_loading')}</p>
                    <div className="flex space-x-1 justify-center mt-2">
                      <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white/50 backdrop-blur-sm rounded-xl p-4 border border-white/20 max-w-xs mx-auto">
                <div className="flex items-center justify-center space-x-2 text-gray-500">
                  <span className="animate-bounce">👆</span>
                  <span className="text-sm font-medium">{t('label_scroll_for_more')}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 더 이상 로드할 데이터가 없는 경우 - 개선된 디자인 */}
        {!hasMore && voteHistory.length > 0 && (
          <div className="text-center py-12">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl p-8 shadow-lg border border-white/20 max-w-md mx-auto">
              <div className="w-16 h-16 bg-gradient-to-r from-gray-100 to-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎉</span>
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">모든 투표 내역을 확인했어요!</h3>
              <p className="text-gray-600">{t('label_no_more_votes')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 