'use client';

import { useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, InitialLoadingState, EmptyState, InfiniteScrollTrigger } from '@/components/mypage/MypageStates';
import type { StatisticCard, MypageHeaderConfig, EmptyStateConfig } from '@/types/mypage-common';

interface RechargeItem {
  id: string;
  receiptId: string;
  receiptNumber: string;
  receiptUrl?: string;
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  paymentMethod: string;
  paymentProvider: string;
  transactionId: string;
  merchantTransactionId?: string;
  status: string;
  currency: string;
  storeProductId: string;
  exchangeRate?: number;
  originalAmount?: number;
  originalCurrency?: string;
  paymentDetails: {
    cardLast4?: string;
    cardBrand?: string;
    bankName?: string;
    paypalEmail?: string;
  };
  receiptData: {
    itemName: string;
    description: string;
    quantity: number;
    unitPrice: number;
    taxAmount?: number;
    discountAmount?: number;
  };
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    referrer?: string;
  };
  createdAt: string;
  updatedAt: string;
  receiptGeneratedAt?: string;
}

interface RechargeHistoryClientProps {
  initialUser: User;
}

export default function RechargeHistoryClient({ initialUser }: RechargeHistoryClientProps) {
  const { 
    formatDate,  // timezone 기반 절대시간 포맷터
    getLocalizedText 
  } = useLanguage();
  const { t, tDynamic, translations } = useTranslations();

  // 클립보드 복사 함수 - useCallback으로 최적화
  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy: ', err);
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }, []);

  // 통화 포맷팅 함수 - useCallback으로 최적화
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount);
  }, []);

  // 결제 방법 아이콘 - useCallback으로 최적화
  const getPaymentMethodIcon = useCallback((method: string) => {
    if (!method || typeof method !== 'string') {
      return '💰';
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
  }, []);

  // 상태 색상 - useCallback으로 최적화
  const getStatusColor = useCallback((status: string) => {
    if (!status || typeof status !== 'string') {
      return 'text-gray-600 bg-gray-100';
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
  }, []);

  // 데이터 변환 함수
  const transformRechargeItem = useCallback((item: any): RechargeItem => {
    return {
      ...item,
      receiptId: item.receiptId || `receipt-${item.id}`,
      receiptNumber: item.receiptNumber || `R${Date.now()}`,
      currency: item.currency || 'KRW',
      paymentProvider: item.paymentProvider || 'Unknown',
      receiptData: {
        itemName: item.receiptData?.itemName || t('label_star_candy_recharge'),
        description: item.receiptData?.description || t('star_candy_purchase_description'),
        quantity: item.receiptData?.quantity || 1,
        unitPrice: item.receiptData?.unitPrice || Math.round(item.amount / (item.receiptData?.quantity || 1)),
        taxAmount: item.receiptData?.taxAmount,
        discountAmount: item.receiptData?.discountAmount
      },
      paymentDetails: item.paymentDetails || {},
      updatedAt: item.updatedAt || item.createdAt
    };
  }, [t]);

  // 무한 스크롤 훅 사용
  const {
    items: recharges,
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
  } = useInfiniteScroll<RechargeItem>({
    apiEndpoint: '/api/user/recharge-history',
    limit: 10,
    transform: transformRechargeItem,
    onSuccess: (data) => {
      console.log('📡 API 응답 데이터:', data);
    },
    onError: (error) => {
      console.error('충전 내역 조회 에러:', error);
    }
  });

  // 헤더 설정
  const headerConfig: MypageHeaderConfig = {
    title: t('page_title_my_recharge_history'),
    icon: '💳',
    backUrl: '/mypage',
    backLabel: t('label_back_to_mypage')
  };

  // 통계 카드 설정
  const statisticsCards: StatisticCard[] = [
    {
      id: 'primary',
      title: t('label_total_recharge_count'),
      value: totalCount,
      description: t('label_recharge_count_description'),
      icon: '📊',
      bgColor: 'from-primary-50 to-primary-100',
      borderColor: 'border-primary-200/50',
      textColor: 'text-primary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'secondary',
      title: t('label_total_recharge_amount'),
      value: statistics?.totalAmount || 0,
      description: t('label_amount_description'),
      icon: '💰',
      bgColor: 'from-secondary-50 to-secondary-100',
      borderColor: 'border-secondary-200/50',
      textColor: 'text-secondary-800',
      isLoading: isLoading || isInitialLoad
    },
    {
      id: 'point',
      title: t('text_star_candy'),
      value: statistics?.totalStarCandy || 0,
      description: t('label_star_candy_description'),
      icon: '⭐',
      bgColor: 'from-point-50 to-point-100',
      borderColor: 'border-point-200/50',
      textColor: 'text-point-800',
      isLoading: isLoading || isInitialLoad
    }
  ];

  // 빈 상태 설정
  const emptyStateConfig: EmptyStateConfig = {
    title: t('label_no_recharge_history'),
    description: t('label_no_recharge_history_message'),
    actionLabel: t('label_go_recharge_star_candy'),
    actionUrl: '/shop',
    icon: '💳'
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6">
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
        {(isLoading || isInitialLoad) && recharges.length === 0 && !error && (
          <InitialLoadingState translations={translations} />
        )}

        {/* 빈 상태 */}
        {isEmpty && (
          <EmptyState 
            config={emptyStateConfig}
            translations={translations}
          />
        )}

        {/* 충전 내역 리스트 */}
        <div className="space-y-4">
          {recharges.map((recharge, index) => (
            <div 
              key={recharge.id} 
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
                  {/* 결제 정보 */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors duration-300 mb-1">
                          {recharge.receiptData?.itemName || t('label_star_candy_recharge')}
                        </h3>
                        <div className="h-0.5 w-12 bg-gradient-to-r from-primary to-point rounded-full"></div>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${getStatusColor(recharge.status)}`}>
                          {recharge.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* 받은 별사탕 */}
                      <div className="relative bg-gradient-to-br from-primary-50 to-point-50 rounded-xl p-3 group-hover:from-primary-100 group-hover:to-point-100 transition-all duration-300 border border-primary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-primary-200 to-point-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-primary to-point rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">⭐</span>
                          </div>
                          <span className="font-bold text-primary-800 text-sm">{t('label_received_star_candy')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <img 
                              src="/images/star-candy/star_100.png" 
                              alt={t('text_star_candy')} 
                              className="w-5 h-5 shadow-sm" 
                            />
                          </div>
                          <span className="text-lg font-bold bg-gradient-to-r from-primary to-point bg-clip-text text-transparent">
                            {(recharge.starCandyAmount + recharge.bonusAmount).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      
                      {/* 상품 코드 */}
                      <div className="relative bg-gradient-to-br from-sub-50 to-secondary-50 rounded-xl p-3 group-hover:from-sub-100 group-hover:to-secondary-100 transition-all duration-300 border border-sub-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-sub-200 to-secondary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-sub to-secondary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">🏷️</span>
                          </div>
                          <span className="font-bold text-sub-800 text-sm">{t('label_product_code')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-bold text-gray-900">{recharge.storeProductId}</span>
                          <button
                            onClick={() => copyToClipboard(recharge.storeProductId)}
                            className="p-1 hover:bg-sub-100 rounded transition-colors duration-200 group/copy"
                            title={t('label_copy')}
                          >
                            <span className="text-xs group-hover/copy:scale-110 transition-transform duration-200">📋</span>
                          </button>
                        </div>
                      </div>

                      {/* 결제 방법 */}
                      <div className="relative bg-gradient-to-br from-secondary-50 to-primary-50 rounded-xl p-3 group-hover:from-secondary-100 group-hover:to-primary-100 transition-all duration-300 border border-secondary-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-secondary-200 to-primary-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-secondary to-primary rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">{getPaymentMethodIcon(recharge.paymentMethod)}</span>
                          </div>
                          <span className="font-bold text-secondary-800 text-sm">{t('label_payment_method')}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">
                          {recharge.paymentProvider === 'PayPal' ? t('label_paypal') : recharge.paymentMethod}
                        </span>
                      </div>

                      {/* 결제 일시 */}
                      <div className="relative bg-gradient-to-br from-point-50 to-sub-50 rounded-xl p-3 group-hover:from-point-100 group-hover:to-sub-100 transition-all duration-300 border border-point-100/50">
                        <div className="absolute top-2 right-2 w-6 h-6 bg-gradient-to-r from-point-200 to-sub-200 rounded-full opacity-50"></div>
                        <div className="flex items-center space-x-2 mb-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-point to-sub rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">📅</span>
                          </div>
                          <span className="font-bold text-point-800 text-sm">{t('label_recharge_date')}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900">{formatDate(recharge.createdAt)}</span>
                      </div>
                    </div>

                    {/* 영수증 정보 */}
                    <div className="mt-3 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-3 border border-gray-200/50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded-lg flex items-center justify-center shadow-sm">
                            <span className="text-white text-xs">🧾</span>
                          </div>
                          <span className="font-bold text-gray-800 text-sm">{t('label_receipt')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-600">{recharge.receiptNumber}</span>
                          <button
                            onClick={() => copyToClipboard(recharge.receiptNumber)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors duration-200 group/copy"
                            title={t('label_copy')}
                          >
                            <span className="text-xs group-hover/copy:scale-110 transition-transform duration-200">📋</span>
                          </button>
                          {recharge.receiptUrl && (
                            <Link
                              href={recharge.receiptUrl}
                              target="_blank"
                              className="p-1 hover:bg-gray-200 rounded transition-colors duration-200"
                              title="영수증 보기"
                            >
                              <span className="text-xs">🔗</span>
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-gray-700">
                        <div className="flex justify-between">
                          <span>{t('label_payment_amount')}:</span>
                          <span className="font-bold">{formatCurrency(recharge.amount)}</span>
                        </div>
                        {recharge.bonusAmount > 0 && (
                          <div className="flex justify-between text-point-700">
                            <span>{t('label_bonus')}:</span>
                            <span className="font-bold">+{recharge.bonusAmount.toLocaleString()}</span>
                          </div>
                        )}
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