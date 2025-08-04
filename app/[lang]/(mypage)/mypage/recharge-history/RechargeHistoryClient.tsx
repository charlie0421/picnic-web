'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';
import { useTranslations } from '@/hooks/useTranslations';
import { MypageHeader } from '@/components/mypage/MypageHeader';
import { ErrorState, EmptyState } from '@/components/mypage/MypageStates';
import Pagination from '@/components/common/molecules/Pagination';
import type { EmptyStateConfig } from '@/types/mypage-common';

interface RechargeItem {
  id: string;
  receiptNumber: string;
  receiptUrl?: string;
  amount: number;
  starCandyAmount: number;
  bonusAmount: number;
  paymentMethod: string;
  paymentProvider: string;
  status: string;
  currency: string;
  storeProductId: string;
  createdAt: string;
}

interface PaginationInfo {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface RechargeHistoryClientProps {
  initialHistory: RechargeItem[];
  initialPagination: PaginationInfo;
  initialError: string | null;
}

export default function RechargeHistoryClient({ 
  initialHistory, 
  initialPagination, 
  initialError 
}: RechargeHistoryClientProps) {
  const { formatDate } = useLanguage();
  const { tDynamic, translations } = useTranslations();

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  }, []);

  const formatCurrency = useCallback((amount: number, currency: string) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: currency || 'KRW'
    }).format(amount);
  }, []);

  const getPaymentMethodIcon = useCallback((method: string) => {
    if (!method) return '💰';
    switch (method.toLowerCase()) {
      case 'paypal': return '💳';
      case 'card': return '💳';
      case 'bank_transfer': return '🏦';
      case 'mobile': return '📱';
      default: return '💰';
    }
  }, []);

  const getStatusColor = useCallback((status: string) => {
    if (!status) return 'text-gray-600 bg-gray-100';
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

  const emptyStateConfig: EmptyStateConfig = {
    title: tDynamic('label_no_recharge_history'),
    description: tDynamic('label_no_recharge_history_message'),
    actionLabel: tDynamic('label_go_recharge_star_candy'),
    actionUrl: '/star-candy',
    icon: '💳'
  };

  if (initialError) {
    return <ErrorState error={new Error(initialError)} onRetry={() => {}} translations={translations} />;
  }

  const statistics = {
      totalAmount: initialHistory.reduce((acc, item) => acc + item.amount, 0),
      totalStarCandy: initialHistory.reduce((acc, item) => acc + item.starCandyAmount + item.bonusAmount, 0),
  };
  
  if (initialHistory.length === 0) {
    return (
      <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: tDynamic('page_title_my_recharge_history'),
            icon: '💳',
            backUrl: '/mypage',
            backLabel: tDynamic('label_back_to_mypage')
          }}
          statistics={[]}
          translations={translations}
        />
        <EmptyState 
          config={emptyStateConfig}
          translations={translations}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      <div className="container mx-auto px-4 py-6">
        <MypageHeader 
          config={{
            title: tDynamic('page_title_my_recharge_history'),
            icon: '💳',
            backUrl: '/mypage',
            backLabel: tDynamic('label_back_to_mypage')
          }}
          statistics={[
    {
      id: 'primary',
              title: tDynamic('label_total_recharge_count'),
              value: initialPagination.totalCount,
              description: tDynamic('label_recharge_count_description'),
      icon: '📊',
              bgColor: 'from-primary-50 to-primary-100',
      borderColor: 'border-primary-200/50',
              textColor: 'text-primary-800',
              isLoading: false
    },
    {
      id: 'secondary',
              title: tDynamic('label_total_recharge_amount'),
              value: statistics.totalAmount,
              description: tDynamic('label_amount_description'),
      icon: '💰',
              bgColor: 'from-secondary-50 to-secondary-100',
      borderColor: 'border-secondary-200/50',
              textColor: 'text-secondary-800',
              isLoading: false
            },
            {
              id: 'point',
              title: tDynamic('text_star_candy'),
              value: statistics.totalStarCandy,
              description: tDynamic('label_star_candy_description'),
      icon: '⭐',
              bgColor: 'from-point-50 to-point-100',
              borderColor: 'border-point-200/50',
              textColor: 'text-point-800',
              isLoading: false
            }
          ]}
          translations={translations}
        />

        <div className="space-y-4 mt-6">
          {initialHistory.map((recharge) => (
            <div key={recharge.id} className="group relative bg-white/90 backdrop-blur-md rounded-2xl shadow-md hover:shadow-lg border border-white/30 overflow-hidden transition-all duration-300">
              <div className="h-1 bg-gradient-to-r from-primary via-secondary to-point"></div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary transition-colors">
                    {tDynamic('label_star_candy_recharge')}
                  </h3>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-lg border ${getStatusColor(recharge.status)}`}>
                    {recharge.status}
                  </span>
                </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <InfoCard title={tDynamic('label_received_star_candy')} icon="⭐">
                    <span className="text-lg font-bold bg-gradient-to-r from-primary to-point bg-clip-text text-transparent">
                      {(recharge.starCandyAmount + recharge.bonusAmount).toLocaleString()}
                          </span>
                  </InfoCard>
                  <InfoCard title={tDynamic('label_product_code')} icon="🏷️">
                     <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900">{recharge.storeProductId}</span>
                        <button onClick={() => copyToClipboard(recharge.storeProductId)} className="p-1 hover:bg-sub-100 rounded" title={tDynamic('label_copy')}>
                          <span className="text-xs">📋</span>
                        </button>
                      </div>
                  </InfoCard>
                  <InfoCard title={tDynamic('label_payment_method')} icon={getPaymentMethodIcon(recharge.paymentMethod)}>
                    <span className="text-sm font-bold text-gray-900">{recharge.paymentProvider}</span>
                  </InfoCard>
                   <InfoCard title={tDynamic('label_recharge_date')} icon="📅">
                    <span className="text-sm font-bold text-gray-900">{formatDate(recharge.createdAt)}</span>
                  </InfoCard>
                          </div>
                 <div className="mt-3 bg-gray-50 rounded-xl p-3 border">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs">🧾</span>
                            <span className="font-bold text-gray-800 text-sm">{tDynamic('label_receipt')}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-600">{recharge.receiptNumber}</span>
                            <button onClick={() => copyToClipboard(recharge.receiptNumber)} className="p-1 hover:bg-gray-200 rounded" title={tDynamic('label_copy')}>
                                <span className="text-xs">📋</span>
                            </button>
                            {recharge.receiptUrl && (
                                <Link href={recharge.receiptUrl} target="_blank" className="p-1 hover:bg-gray-200 rounded" title="영수증 보기">
                                    <span className="text-xs">🔗</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    <div className="mt-2 text-sm text-gray-700 flex justify-between">
                        <span>{tDynamic('label_payment_amount')}:</span>
                        <span className="font-bold">{formatCurrency(recharge.amount, recharge.currency)}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <Pagination 
          totalPages={initialPagination.totalPages}
          currentPage={initialPagination.page}
        />
      </div>
    </div>
  );
} 

const InfoCard = ({ title, icon, children }: { title: string, icon: string, children: React.ReactNode }) => (
    <div className="bg-gray-50 rounded-xl p-3 border">
        <div className="flex items-center space-x-2 mb-2">
            <div className="w-6 h-6 bg-gray-200 rounded-lg flex items-center justify-center">
                <span className="text-xs">{icon}</span>
            </div>
            <span className="font-bold text-gray-600 text-sm">{title}</span>
        </div>
        {children}
    </div>
);
