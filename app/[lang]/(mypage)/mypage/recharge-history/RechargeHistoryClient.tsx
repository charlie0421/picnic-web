'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface RechargeItem {
  id: string;
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  paymentMethod: string;
  transactionId: string;
  status: string;
  createdAt: string;
}

interface RechargeResponse {
  success: boolean;
  data: RechargeItem[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasNext: boolean;
  };
}

interface Translations {
  page_title_my_recharge_history: string;
  label_loading: string;
  label_no_recharge_history: string;
  label_load_more: string;
  label_recharge_amount: string;
  label_recharge_date: string;
  label_recharge_method: string;
  label_star_candy_amount: string;
  label_error_occurred: string;
  label_retry: string;
  label_back_to_mypage: string;
  label_please_try_again: string;
  label_loading_recharge_history: string;
  label_all_recharge_history_checked: string;
  text_star_candy: string;
  label_total_recharge_amount: string;
  label_total_recharge_count: string;
}

interface RechargeHistoryClientProps {
  initialUser: User;
  translations: Translations;
}

export default function RechargeHistoryClient({ initialUser, translations }: RechargeHistoryClientProps) {
  const [recharges, setRecharges] = useState<RechargeItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
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

  const fetchRechargeHistory = useCallback(async (pageNum: number, reset: boolean = false) => {
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
      const response = await fetch(`/api/user/recharge-history?page=${pageNum}&limit=10`, {
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error('충전 내역 조회에 실패했습니다.');
      }

      const data: RechargeResponse = await response.json();

      if (data.success) {
        setRecharges(prev => {
          return reset ? data.data : [...prev, ...data.data];
        });
        setTotalCount(data.pagination.totalCount);
        setHasMore(data.pagination.hasNext);
        
        // 총 충전 금액 계산
        if (reset) {
          const total = data.data.reduce((sum, item) => sum + item.amount, 0);
          setTotalAmount(total);
        }
        
        // 페이지 번호 업데이트
        if (!reset) {
          setPage(pageNum);
        }
      } else {
        throw new Error('충전 내역 조회에 실패했습니다.');
      }
    } catch (err) {
      // AbortError는 무시
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error('충전 내역 조회 에러:', err);
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  // 초기 데이터 로드
  useEffect(() => {
    fetchRechargeHistory(1, true);
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
          fetchRechargeHistory(nextPage, false);
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
  }, [hasMore, isLoading, isLoadingMore, page, fetchRechargeHistory]);

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  };

  const retry = () => {
    setError(null);
    setRecharges([]);
    setPage(1);
    setHasMore(true);
    fetchRechargeHistory(1, true);
  };

  const getPaymentMethodIcon = (method: string) => {
    switch (method.toLowerCase()) {
      case 'paypal':
        return '💳';
      case 'card':
      case 'credit_card':
        return '💳';
      case 'bank_transfer':
        return '🏦';
      case 'mobile':
        return '📱';
      default:
        return '💰';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'success':
        return 'text-green-600 bg-green-100';
      case 'pending':
        return 'text-yellow-600 bg-yellow-100';
      case 'failed':
      case 'cancelled':
        return 'text-red-600 bg-red-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
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
                    <span className="text-3xl">💳</span>
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
                      {t('page_title_my_recharge_history')}
                    </h1>
                    <div className="mt-2 space-y-1">
                      {totalCount > 0 && (
                        <p className="text-gray-600">
                          {t('label_total_recharge_count')}: {totalCount.toLocaleString()}회
                        </p>
                      )}
                      {totalAmount > 0 && (
                        <p className="text-gray-600">
                          {t('label_total_recharge_amount')}: {formatCurrency(totalAmount)}
                        </p>
                      )}
                    </div>
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
              <span className="text-gray-600">{t('label_loading_recharge_history')}</span>
            </div>
          </div>
        )}

        {/* 충전 내역 목록 */}
        {!isLoading && recharges.length > 0 && (
          <div className="space-y-4 mb-8">
            {recharges.map((recharge) => (
              <div
                key={recharge.id}
                className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-lg border border-white/30 hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <span className="text-2xl">{getPaymentMethodIcon(recharge.paymentMethod)}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {formatCurrency(recharge.amount)}
                        </h3>
                        <p className="text-sm text-gray-500">{recharge.paymentMethod}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(recharge.status)}`}>
                        {recharge.status}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-sm text-gray-500">{t('label_star_candy_amount')}</p>
                        <p className="font-medium text-gray-900 flex items-center space-x-1">
                          <img 
                            src="/images/star-candy/star_100.png" 
                            alt="별사탕" 
                            className="w-4 h-4" 
                          />
                          <span>{recharge.starCandyAmount.toLocaleString()}</span>
                          {recharge.bonusAmount > 0 && (
                            <span className="text-sm text-orange-600">
                              (+{recharge.bonusAmount.toLocaleString()})
                            </span>
                          )}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-gray-500">{t('label_recharge_date')}</p>
                        <p className="font-medium text-gray-900">{formatDate(recharge.createdAt)}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm text-gray-500">거래 ID</p>
                        <p className="font-medium text-gray-900 text-xs">{recharge.transactionId}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 빈 상태 */}
        {!isLoading && recharges.length === 0 && !error && (
          <div className="text-center py-12">
            <div className="w-24 h-24 bg-gradient-to-r from-primary-100 to-secondary-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">💳</span>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {t('label_no_recharge_history')}
            </h3>
            <p className="text-gray-600 mb-6">
              별사탕 충전 내역이 없습니다.
            </p>
            <Link 
              href="/star-candy-recharge"
              className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-primary-500 to-secondary-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <span>별사탕 충전하기</span>
              <span className="text-lg">⭐</span>
            </Link>
          </div>
        )}

        {/* 더 로드하기 버튼 및 무한 스크롤 */}
        {recharges.length > 0 && hasMore && (
          <div ref={sentinelRef} className="flex justify-center py-8">
            {isLoadingMore ? (
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
                <span className="text-gray-600">{t('label_loading')}</span>
              </div>
            ) : (
              <div className="text-gray-500 text-sm">스크롤하여 더 보기 👇</div>
            )}
          </div>
        )}

        {/* 모든 데이터 로드 완료 */}
        {recharges.length > 0 && !hasMore && !isLoadingMore && (
          <div className="text-center py-8">
            <div className="text-gray-500 text-sm">{t('label_all_recharge_history_checked')}</div>
          </div>
        )}
      </div>
    </div>
  );
} 