'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface RechargeItem {
  id: string;
  receiptId: string; // 영수증 고유 ID
  receiptNumber: string; // 영수증 번호 (사용자 친화적)
  receiptUrl?: string; // 영수증 다운로드 URL
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  paymentMethod: string;
  paymentProvider: string; // 결제 제공업체 (PayPal, PortOne 등)
  transactionId: string;
  merchantTransactionId?: string; // 판매자 거래 ID
  status: string;
  currency: string; // 통화 코드
  storeProductId: string; // 상품 코드 (STAR100 등)
  exchangeRate?: number; // 환율 (외화 결제시)
  originalAmount?: number; // 원래 금액 (외화 결제시)
  originalCurrency?: string; // 원래 통화
  paymentDetails: {
    cardLast4?: string; // 카드 마지막 4자리
    cardBrand?: string; // 카드 브랜드 (Visa, MasterCard 등)
    bankName?: string; // 은행명
    paypalEmail?: string; // PayPal 이메일
  };
  receiptData: {
    itemName: string; // 상품명
    description: string; // 상품 설명
    quantity: number; // 수량
    unitPrice: number; // 단가
    taxAmount?: number; // 세금
    discountAmount?: number; // 할인 금액
  };
  metadata?: {
    ipAddress?: string; // 결제 IP
    userAgent?: string; // 사용자 에이전트
    referrer?: string; // 추천인
  };
  createdAt: string;
  updatedAt: string;
  receiptGeneratedAt?: string; // 영수증 생성 시간
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
  error?: string; // 에러 메시지 필드 추가
  message?: string; // 추가 메시지 필드
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
  label_receipt: string;
  label_payment_amount: string;
  label_exchange_rate: string;
  label_bonus: string;
  label_payment_method: string;
  label_card_payment: string;
  label_bank_transfer: string;
  label_product_info: string;
  label_quantity: string;
  label_unit_price: string;
  label_transaction_info: string;
  label_transaction_id: string;
  label_merchant_transaction_id: string;
  label_transaction_datetime: string;
  label_transaction_time: string;
  label_receipt_generated: string;
  label_no_recharge_history_message: string;
  label_go_recharge_star_candy: string;
  label_star_candy_recharge: string;
  // 새로 추가된 번역 키들
  error_recharge_history_fetch_failed: string;
  error_unknown_occurred: string;
  console_recharge_history_fetch_error: string;
  star_candy_purchase_description: string;
  label_recharge_count_description: string;
  label_amount_description: string;
  label_star_candy_description: string;
}

interface RechargeHistoryClientProps {
  initialUser: User;
  translations: Translations;
}

export default function RechargeHistoryClient({ initialUser, translations }: RechargeHistoryClientProps) {
  const [recharges, setRecharges] = useState<RechargeItem[]>([]);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false); // 초기값을 false로 변경
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
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
      // Receipt 기반 쿼리 파라미터 추가
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: '10',
        includeReceipt: 'true', // receipt 정보 포함
        sortBy: 'receiptGeneratedAt', // receipt 생성 시간 기준 정렬
        sortOrder: 'desc'
      });

      const response = await fetch(`/api/user/recharge-history?${params.toString()}`, {
        signal: abortControllerRef.current.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(t('error_recharge_history_fetch_failed'));
      }

      const data: RechargeResponse = await response.json();

      if (data.success) {
        // Receipt 데이터 유효성 검증
        const validatedData = data.data.map(item => ({
          ...item,
          receiptId: item.receiptId || `receipt-${item.id}`,
          receiptNumber: item.receiptNumber || `R${Date.now()}`,
          currency: item.currency || 'KRW',
          paymentProvider: item.paymentProvider || 'Unknown',
          receiptData: item.receiptData || {
            itemName: t('label_star_candy_recharge'),
            description: t('star_candy_purchase_description'),
            quantity: 1,
            unitPrice: item.amount
          },
          paymentDetails: item.paymentDetails || {},
          updatedAt: item.updatedAt || item.createdAt
        }));

        setRecharges(prev => {
          return reset ? validatedData : [...prev, ...validatedData];
        });
        setTotalCount(data.pagination.totalCount);
        setHasMore(data.pagination.hasNext);
        
        // 총 충전 금액 계산 (외화 고려)
        if (reset) {
          const total = validatedData.reduce((sum, item) => {
            // 원화가 아닌 경우 환율 적용
            const localAmount = item.currency !== 'KRW' && item.exchangeRate 
              ? item.originalAmount || item.amount 
              : item.amount;
            return sum + localAmount;
          }, 0);
          setTotalAmount(total);
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
        throw new Error(data.error || t('error_recharge_history_fetch_failed'));
      }
    } catch (err) {
      // AbortError는 무시
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      
      console.error(t('console_recharge_history_fetch_error') + ':', err);
      setError(err instanceof Error ? err.message : t('error_unknown_occurred'));
      
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
    setHasMore(false); // 초기 상태로 리셋
    setIsInitialLoad(true); // 초기 로딩 상태로 리셋
    fetchRechargeHistory(1, true);
  };

  const getPaymentMethodIcon = (method: string) => {
    if (!method || typeof method !== 'string') {
      return '💰'; // 기본 아이콘
    }
    
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
    if (!status || typeof status !== 'string') {
      return 'text-gray-600 bg-gray-100'; // 기본 색상
    }
    
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
                      <span className="text-white text-xl">💳</span>
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-sub to-point rounded-full animate-pulse"></div>
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-primary-600 to-point bg-clip-text text-transparent leading-tight">
                      {t('page_title_my_recharge_history')}
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
                      <h3 className="font-bold text-primary-800 text-lg">{t('label_total_recharge_count')}</h3>
                      <p className="text-primary-600 text-sm">{t('label_recharge_count_description') || '총 구매 횟수'}</p>
                    </div>
                  </div>
                  <p className="text-primary-800 font-bold text-3xl">{totalCount.toLocaleString()}</p>
                </div>
                
                <div className="bg-gradient-to-br from-secondary-50 to-secondary-100 rounded-2xl p-6 border border-secondary-200/50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-secondary rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">💰</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-secondary-800 text-lg">{t('label_total_recharge_amount')}</h3>
                      <p className="text-secondary-600 text-sm">{t('label_amount_description') || '총 결제 금액'}</p>
                    </div>
                  </div>
                  <p className="text-secondary-800 font-bold text-3xl">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-point-50 to-point-100 rounded-2xl p-6 border border-point-200/50">
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="w-10 h-10 bg-point rounded-xl flex items-center justify-center">
                      <span className="text-white text-lg">⭐</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-point-800 text-lg">{t('text_star_candy')}</h3>
                      <p className="text-point-600 text-sm">{t('label_star_candy_description') || '총 받은 별사탕'}</p>
                    </div>
                  </div>
                  <p className="text-point-800 font-bold text-3xl">
                    {recharges.reduce((sum, r) => sum + r.starCandyAmount + r.bonusAmount, 0).toLocaleString()}
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
        {(isLoading || isInitialLoad) && recharges.length === 0 && (
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
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-2xl">💳</div>
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
                
                <p className="text-gray-600 font-medium">{t('label_loading_recharge_history')}</p>
              </div>
            </div>
          </div>
        )}

        {/* 빈 상태 - 로딩이 완전히 끝난 후에만 표시 */}
        {!isLoading && !isInitialLoad && recharges.length === 0 && !error && (
          <div className="text-center py-20">
            <div className="relative bg-white/80 backdrop-blur-md rounded-3xl p-16 shadow-2xl border border-white/30 max-w-lg mx-auto">
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-16 h-16 bg-gradient-to-br from-primary-100 to-point-100 rounded-full blur-2xl opacity-50"></div>
              <div className="absolute bottom-4 left-4 w-12 h-12 bg-gradient-to-tr from-secondary-100 to-sub-100 rounded-full blur-xl opacity-60"></div>
              
              <div className="relative z-10">
                <div className="relative mb-8">
                  <div className="w-28 h-28 bg-gradient-to-br from-primary-100 via-secondary-100 to-point-100 rounded-full flex items-center justify-center mx-auto animate-bounce shadow-lg">
                    <span className="text-5xl">💳</span>
                  </div>
                  <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-sub to-point rounded-full animate-ping opacity-60"></div>
                </div>
                
                <h3 className="text-2xl font-bold bg-gradient-to-r from-primary via-secondary to-point bg-clip-text text-transparent mb-4">
                  {t('label_no_recharge_history')}
                </h3>
                
                <p className="text-gray-600 mb-8 text-lg leading-relaxed">
                  {t('label_no_recharge_history_message')}
                </p>
                
                <Link 
                  href="/star-candy"
                  className="inline-flex items-center space-x-2 px-8 py-4 bg-gradient-to-r from-primary to-primary-600 text-white rounded-2xl hover:from-primary-600 hover:to-primary-700 transition-all duration-300 transform hover:scale-105 shadow-lg font-semibold"
                >
                  <span>{t('label_go_recharge_star_candy')}</span>
                  <span className="text-lg">⭐</span>
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* 충전 내역 리스트 - Receipt 기반 고도화 */}
        <div className="space-y-8">
          {recharges.map((recharge, index) => (
            <div 
              key={`${recharge.receiptId}-${recharge.id}-${index}`} 
              className="group relative bg-white/90 backdrop-blur-md rounded-3xl shadow-lg hover:shadow-2xl border border-white/30 overflow-hidden transition-all duration-500 transform hover:scale-[1.02] hover:-translate-y-2"
              style={{
                animationDelay: `${index * 100}ms`
              }}
            >
              {/* 상단 그라데이션 바 - Receipt 상태별 색상 */}
              <div className={`h-3 ${
                recharge.status === 'completed' 
                  ? 'bg-gradient-to-r from-green-400 via-green-500 to-green-600' 
                  : recharge.status === 'pending'
                  ? 'bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600'
                  : recharge.status === 'failed'
                  ? 'bg-gradient-to-r from-red-400 via-red-500 to-red-600'
                  : 'bg-gradient-to-r from-primary via-secondary via-sub to-point'
              }`}></div>
              
              {/* 배경 데코레이션 */}
              <div className="absolute top-4 right-4 w-20 h-20 bg-gradient-to-br from-primary-50 to-point-50 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              <div className="relative p-8">
                {/* Receipt 헤더 정보 */}
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-2xl font-bold text-gray-900 group-hover:text-primary transition-colors duration-300">
                        {t('label_receipt')} #{recharge.receiptNumber}
                      </h3>
                      <span className={`px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(recharge.status)}`}>
                        {recharge.status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="flex items-center space-x-1">
                        <span>🏢</span>
                        <span>{recharge.paymentProvider}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span>📋</span>
                        <span>ID: {recharge.receiptId.slice(-8)}</span>
                      </span>
                    </div>
                    <div className="h-1 w-16 bg-gradient-to-r from-primary to-point rounded-full mt-2"></div>
                  </div>
                  {recharge.receiptUrl && (
                    <div className="flex-shrink-0 ml-6">
                      <a 
                        href={recharge.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/btn relative flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-sub-500 to-point-500 text-white rounded-xl hover:from-sub-600 hover:to-point-600 transition-all duration-300 transform hover:scale-105 shadow-lg text-sm font-semibold"
                      >
                        <span>📥</span>
                        <span>영수증</span>
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent rounded-xl opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300"></div>
                      </a>
                    </div>
                  )}
                </div>

                {/* Receipt 상세 정보 그리드 - 고도화된 카드 시스템 */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* 충전 금액 (외화 고려) */}
                  <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-2xl p-6 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-primary to-point rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">💰</span>
                      </div>
                      <span className="font-bold text-primary-800">{t('label_payment_amount')}</span>
                    </div>
                    <div>
                      <span className="text-2xl font-bold bg-gradient-to-r from-primary to-point bg-clip-text text-transparent">
                        {recharge.currency === 'KRW' ? formatCurrency(recharge.amount) : `${recharge.amount} ${recharge.currency}`}
                      </span>
                      {recharge.originalAmount && recharge.currency !== 'KRW' && (
                        <div className="text-sm text-gray-600 mt-1">
                          {t('label_exchange_rate')}: {recharge.exchangeRate?.toLocaleString()}원 (${recharge.originalAmount} {recharge.originalCurrency})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 별사탕 수량 */}
                  <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-2xl p-6 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-sub to-secondary rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">⭐</span>
                      </div>
                      <span className="font-bold text-sub-800">받은 별사탕</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl font-bold bg-gradient-to-r from-sub to-secondary bg-clip-text text-transparent">
                        {recharge.starCandyAmount.toLocaleString()}
                      </span>
                      {recharge.bonusAmount > 0 && (
                        <span className="px-2 py-1 bg-gradient-to-r from-yellow-100 to-yellow-200 text-yellow-800 rounded-lg text-sm font-semibold">
                          {t('label_bonus')} +{recharge.bonusAmount}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 결제 수단 상세 */}
                  <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-2xl p-6 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-secondary to-primary rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">{getPaymentMethodIcon(recharge.paymentMethod)}</span>
                      </div>
                      <span className="font-bold text-secondary-800">{t('label_payment_method')}</span>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900 mb-1">
                        {recharge.paymentMethod === 'card' ? t('label_card_payment') :
                         recharge.paymentMethod === 'paypal' ? 'PayPal' :
                         recharge.paymentMethod === 'bank_transfer' ? t('label_bank_transfer') : 
                         recharge.paymentMethod}
                      </div>
                      {recharge.paymentDetails.cardLast4 && (
                        <div className="text-sm text-gray-600">
                          {recharge.paymentDetails.cardBrand} ****{recharge.paymentDetails.cardLast4}
                        </div>
                      )}
                      {recharge.paymentDetails.bankName && (
                        <div className="text-sm text-gray-600">
                          {recharge.paymentDetails.bankName}
                        </div>
                      )}
                      {recharge.paymentDetails.paypalEmail && (
                        <div className="text-sm text-gray-600">
                          {recharge.paymentDetails.paypalEmail}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 상품 정보 */}
                  <div className="md:col-span-2 lg:col-span-1 relative bg-gradient-to-br from-point-50 to-sub-50 rounded-2xl p-6 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-point to-sub rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">📦</span>
                      </div>
                      <span className="font-bold text-point-800">{t('label_product_info')}</span>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-gray-900 mb-1">
                        {recharge.receiptData.itemName}
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        {recharge.receiptData.description}
                      </div>
                      {/* 상품 코드 표시 */}
                      <div className="mb-2">
                        <span className="inline-flex items-center px-2 py-1 bg-gradient-to-r from-orange-100 to-yellow-100 text-orange-800 rounded-lg text-xs font-semibold border border-orange-200">
                          <span className="mr-1">🏷️</span>
                          상품코드: {recharge.storeProductId}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm">
                        <span>{t('label_quantity')}: {recharge.receiptData.quantity}</span>
                        <span>{t('label_unit_price')}: {recharge.currency === 'KRW' ? formatCurrency(recharge.receiptData.unitPrice) : `${recharge.receiptData.unitPrice} ${recharge.currency}`}</span>
                      </div>
                    </div>
                  </div>

                  {/* 거래 정보 */}
                  <div className="relative bg-gradient-to-br from-green-50 to-blue-50 rounded-2xl p-6 group-hover:from-green-100 group-hover:to-blue-100 transition-all duration-300 border border-green-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-green-200 to-blue-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-blue-500 rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">🔗</span>
                      </div>
                      <span className="font-bold text-green-800">{t('label_transaction_info')}</span>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">{t('label_transaction_id')}</div>
                        <div className="font-mono text-sm bg-white/80 px-3 py-2 rounded border break-all whitespace-pre-wrap leading-relaxed">
                          {recharge.transactionId}
                        </div>
                      </div>
                      {recharge.merchantTransactionId && (
                        <div>
                          <div className="text-xs text-gray-600 mb-1">{t('label_merchant_transaction_id')}</div>
                          <div className="font-mono text-sm bg-white/80 px-3 py-2 rounded border break-all whitespace-pre-wrap leading-relaxed">
                            {recharge.merchantTransactionId}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 일시 정보 */}
                  <div className="relative bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 group-hover:from-purple-100 group-hover:to-pink-100 transition-all duration-300 border border-purple-100/50">
                    <div className="absolute top-3 right-3 w-8 h-8 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full opacity-50"></div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-sm">
                        <span className="text-white text-sm">📅</span>
                      </div>
                      <span className="font-bold text-purple-800">{t('label_transaction_datetime')}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div>
                        <div className="text-xs text-gray-600">{t('label_transaction_time')}</div>
                        <div className="font-semibold">{formatDate(recharge.createdAt)}</div>
                      </div>
                      {recharge.receiptGeneratedAt && (
                        <div>
                          <div className="text-xs text-gray-600">{t('label_receipt_generated')}</div>
                          <div className="font-semibold">{formatDate(recharge.receiptGeneratedAt)}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 무한 스크롤 트리거 - 초기 로딩 완료 후이고 데이터가 있을 때만 표시 */}
        {!isLoading && !isInitialLoad && recharges.length > 0 && hasMore && (
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
                  <span className="font-medium">스크롤하여 더 보기</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 더 이상 로드할 데이터가 없는 경우 - 초기 로딩 완료 후에만 표시 */}
        {!isLoading && !isInitialLoad && !hasMore && recharges.length > 0 && (
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
                  {t('label_all_recharge_history_checked')}
                </h3>
                <p className="text-gray-600 text-lg">{t('label_all_recharge_history_checked')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 