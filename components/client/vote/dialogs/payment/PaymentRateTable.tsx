'use client';

import { useMemo, useState, useEffect } from 'react';
import type { Region, PaymentProvider, PaymentMethod, Currency, PaymentRateTableProps } from './types';
import { useFilteredPaymentRates, type PaymentRateApiData } from './hooks/usePaymentRates';
import { 
  formatCurrency, 
  formatPercentage, 
  calculateFee, 
  formatFeeCalculation,
  getCurrencySymbol,
  getCurrencyName,
  type FormatCurrencyOptions,
  type FeeCalculation 
} from './utils/currencyFormatter';

/**
 * 결제 수단별 수수료 정보
 */
interface PaymentRateInfo {
  id: string;
  name: string;
  icon: string;
  provider: PaymentProvider;
  baseRate: number;
  additionalFees?: number;
  description?: string;
  benefits?: string[];
  limitations?: string[];
  processingTime: string;
  supportedCurrencies: Currency[];
}

/**
 * 지역별 결제 수단 데이터
 */
const PAYMENT_RATES: Record<Region, PaymentRateInfo[]> = {
  korea: [
    {
      id: 'card',
      name: '카드결제',
      icon: '💳',
      provider: 'portone',
      baseRate: 2.9,
      additionalFees: 0,
      description: '신용카드/체크카드',
      benefits: ['즉시 결제', '포인트 적립', '무이자 할부'],
      limitations: ['일일 한도', '해외카드 제한'],
      processingTime: '즉시',
      supportedCurrencies: ['KRW']
    },
    {
      id: 'bank_transfer',
      name: '계좌이체',
      icon: '🏦',
      provider: 'portone',
      baseRate: 1.5,
      additionalFees: 300,
      description: '실시간 계좌이체',
      benefits: ['낮은 수수료', '안전한 결제'],
      limitations: ['은행 영업시간', '이체 한도'],
      processingTime: '즉시-5분',
      supportedCurrencies: ['KRW']
    },
    {
      id: 'easy_pay',
      name: '간편결제',
      icon: '📱',
      provider: 'portone',
      baseRate: 3.3,
      additionalFees: 0,
      description: '카카오페이, 삼성페이 등',
      benefits: ['편리한 결제', '빠른 처리'],
      limitations: ['앱 설치 필요', '간편결제 등록'],
      processingTime: '즉시',
      supportedCurrencies: ['KRW']
    },
    {
      id: 'mobile',
      name: '휴대폰결제',
      icon: '📲',
      provider: 'portone',
      baseRate: 3.9,
      additionalFees: 0,
      description: '휴대폰 소액결제',
      benefits: ['간편 인증', '통신비 합산'],
      limitations: ['월 한도', '통신사별 차이'],
      processingTime: '즉시',
      supportedCurrencies: ['KRW']
    }
  ],
  global: [
    {
      id: 'paypal',
      name: 'PayPal',
      icon: '🎯',
      provider: 'paypal',
      baseRate: 3.4,
      additionalFees: 0,
      description: 'PayPal 잔액/카드',
      benefits: ['구매자 보호', '전세계 사용'],
      limitations: ['환율 수수료', '계정 필요'],
      processingTime: '즉시',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY']
    },
    {
      id: 'credit_card',
      name: 'Credit Card',
      icon: '💳',
      provider: 'paypal',
      baseRate: 2.9,
      additionalFees: 0.30,
      description: 'Visa, MasterCard, Amex',
      benefits: ['포인트/마일리지', '여행 보험'],
      limitations: ['신용 한도', '해외 수수료'],
      processingTime: '즉시-24시간',
      supportedCurrencies: ['USD', 'EUR', 'GBP']
    },
    {
      id: 'debit_card',
      name: 'Debit Card',
      icon: '🏧',
      provider: 'paypal',
      baseRate: 1.9,
      additionalFees: 0.30,
      description: '직불카드',
      benefits: ['즉시 출금', '낮은 수수료'],
      limitations: ['잔액 한도', '일부 혜택 제한'],
      processingTime: '즉시',
      supportedCurrencies: ['USD', 'EUR']
    }
  ]
};

/**
 * 뷰 모드 타입
 */
type ViewMode = 'table' | 'cards' | 'compact';

/**
 * 정렬 타입
 */
type SortField = 'name' | 'rate' | 'processing-time';
type SortDirection = 'asc' | 'desc';

/**
 * 필터 옵션
 */
interface FilterOptions {
  showPromotions: boolean;
  paymentMethods: string[];
  rateRange: { min: number; max: number };
  processingTime: string[];
}

/**
 * 화면 크기별 브레이크포인트
 */
const BREAKPOINTS = {
  mobile: 640,
  tablet: 768,
  desktop: 1024,
  large: 1280
} as const;

/**
 * 기본 필터 옵션
 */
const DEFAULT_FILTERS: FilterOptions = {
  showPromotions: true,
  paymentMethods: [],
  rateRange: { min: 0, max: 10 },
  processingTime: []
};

/**
 * Payment Rate Table 컴포넌트
 * 지역별 결제 수단과 수수료를 반응형으로 표시합니다.
 */
export function PaymentRateTable({
  region,
  currency = region === 'korea' ? 'KRW' : 'USD',
  isCompact = false,
  showOnly,
  promotional,
  title,
  className = '',
  selectable = false,
  selectedPaymentId,
  onPaymentSelect,
  showDetails = false,
  showLoadingStates = true
}: PaymentRateTableProps) {
  // 반응형 상태 관리
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [screenWidth, setScreenWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : BREAKPOINTS.desktop
  );

  // 정렬 및 필터링 상태
  const [sortField, setSortField] = useState<SortField>('rate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filters, setFilters] = useState<FilterOptions>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  // 상호작용 상태
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [hoveredPayment, setHoveredPayment] = useState<string | null>(null);

  // 화면 크기 감지
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // 초기 크기 설정

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 화면 크기에 따른 뷰 모드 결정
  useEffect(() => {
    if (isCompact) {
      setViewMode('compact');
    } else if (screenWidth < BREAKPOINTS.mobile) {
      setViewMode('cards');
    } else if (screenWidth < BREAKPOINTS.tablet) {
      setViewMode('compact');
    } else {
      setViewMode('table');
    }
  }, [screenWidth, isCompact]);
  // 동적 데이터 가져오기 및 필터링
  const { 
    data: paymentRates = [], 
    isLoading, 
    isError, 
    error 
  } = useFilteredPaymentRates(
    { region, currency },
    {
      showOnly,
      includePromotions: filters.showPromotions,
      sortBy: sortField,
      sortOrder: sortDirection
    }
  );

  // 통화 포맷팅 옵션
  const formatOptions: FormatCurrencyOptions = {
    showDecimals: true,
    showThousandsSeparator: true,
    showSymbol: true,
    showCurrencyCode: false
  };

  // 수수료 계산 (예시 금액 10,000원/100달러 기준)
  const calculatePaymentFee = (rate: PaymentRateApiData, amount: number = region === 'korea' ? 10000 : 100) => {
    // 기본 수수료 계산
    const feeCalc = calculateFee(amount, rate.baseRate, currency, rate.additionalFees || 0);
    
    // 프로모션 할인 적용 (API 데이터의 프로모션 또는 Props의 프로모션)
    const activePromotion = rate.promotion?.isActive ? rate.promotion : promotional;
    if (activePromotion) {
      const discount = (feeCalc.feeAmount * activePromotion.discount) / 100;
      return {
        original: feeCalc.feeAmount,
        discounted: feeCalc.feeAmount - discount,
        savings: discount,
        total: feeCalc.totalAmount - discount
      };
    }
    
    return { 
      original: feeCalc.feeAmount, 
      discounted: feeCalc.feeAmount, 
      savings: 0,
      total: feeCalc.totalAmount
    };
  };

  // 정렬 핸들러
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // 상호작용 핸들러들
  const handlePaymentClick = (rate: PaymentRateApiData) => {
    if (selectable && onPaymentSelect) {
      onPaymentSelect(rate.id, rate);
    }
  };

  const handleDetailsToggle = (rateId: string) => {
    const newExpanded = new Set(expandedDetails);
    if (newExpanded.has(rateId)) {
      newExpanded.delete(rateId);
    } else {
      newExpanded.add(rateId);
    }
    setExpandedDetails(newExpanded);
  };

  const isSelected = (rateId: string) => selectedPaymentId === rateId;
  const isExpanded = (rateId: string) => expandedDetails.has(rateId);
  const isHovered = (rateId: string) => hoveredPayment === rateId;

  // 로딩 상태 렌더링
  if (isLoading && showLoadingStates) {
    return (
      <div className="payment-rate-table-loading p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-500">결제 요율 정보를 불러오는 중...</p>
      </div>
    );
  }

  // 에러 상태 렌더링
  if (isError) {
    return (
      <div className="payment-rate-table-error p-8 text-center">
        <div className="text-red-500 text-lg mb-2">⚠️</div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">결제 정보를 불러올 수 없습니다</h3>
        <p className="text-gray-500 mb-4">
          {error instanceof Error ? error.message : '네트워크 오류가 발생했습니다.'}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // 제목 생성
  const tableTitle = title || `${region === 'korea' ? '🇰🇷 한국' : '🌏 해외'} 결제 수수료`;

  // 카드 뷰 렌더링
  const renderCardView = () => (
    <div className="space-y-4">
      {paymentRates.map((rate) => {
        const fee = calculatePaymentFee(rate);
        const hasPromotion = promotional && fee.savings > 0;
        
        return (
          <div
            key={rate.id}
            className={`relative bg-white border rounded-lg p-4 shadow-sm transition-all duration-200 ${
              selectable ? 'cursor-pointer' : ''
            } ${
              isSelected(rate.id) 
                ? 'border-blue-500 ring-2 ring-blue-100 shadow-lg' 
                : isHovered(rate.id)
                ? 'border-gray-300 shadow-md'
                : 'border-gray-200 hover:shadow-md hover:border-gray-300'
            } ${selectable ? 'hover:bg-blue-50' : ''}`}
            onClick={() => handlePaymentClick(rate)}
            onMouseEnter={() => setHoveredPayment(rate.id)}
            onMouseLeave={() => setHoveredPayment(null)}
          >
            {/* 카드 헤더 */}
            <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-semibold text-blue-600">
                  {rate.name.charAt(0)}
                </span>
              </div>
                <div>
                  <h4 className="font-semibold text-gray-900 text-base">
                    {rate.name}
                  </h4>
                  <p className="text-sm text-gray-500">
                    {rate.description}
                  </p>
                </div>
              </div>
              
              {/* 수수료 (강조) */}
              <div className="text-right">
                {hasPromotion ? (
                  <div className="space-y-1">
                    <div className="text-sm line-through text-gray-400">
                      {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                    </div>
                    <div className="font-bold text-orange-600 text-lg">
                      {formatCurrency(Math.round(fee.discounted), currency, formatOptions)}
                    </div>
                    <div className="text-xs text-orange-500 font-medium">
                      -{formatCurrency(Math.round(fee.savings), currency, formatOptions)} 절약
                    </div>
                  </div>
                ) : (
                  <div className="font-bold text-gray-900 text-lg">
                    {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                  </div>
                )}
              </div>
            </div>

            {/* 카드 상세 정보 */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">수수료율:</span>
                <div className="font-medium text-gray-900">
                  {formatPercentage(rate.baseRate)}
                  {rate.additionalFees && rate.additionalFees > 0 && (
                    <span className="text-xs text-gray-500 ml-1">
                      + {formatCurrency(rate.additionalFees, currency, { ...formatOptions, showDecimals: false })}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <span className="text-gray-500">처리시간:</span>
                <div className="font-medium text-gray-900">
                  {rate.processingTime}
                </div>
              </div>
            </div>

            {/* 상세 정보 토글 버튼 */}
            {showDetails && (rate.benefits || rate.limitations) && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDetailsToggle(rate.id);
                  }}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  <span>상세 정보</span>
                  <span className={`transform transition-transform duration-200 ${
                    isExpanded(rate.id) ? 'rotate-180' : ''
                  }`}>
                    ▼
                  </span>
                </button>

                {/* 확장된 상세 정보 */}
                {isExpanded(rate.id) && (
                  <div className="mt-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
                    {rate.benefits && (
                      <div className="flex items-start gap-2">
                        <span className="text-green-500 text-sm mt-0.5">✓</span>
                        <div className="text-sm text-green-700">
                          <strong>장점:</strong> {rate.benefits.join(', ')}
                        </div>
                      </div>
                    )}
                    {rate.limitations && (
                      <div className="flex items-start gap-2">
                        <span className="text-amber-500 text-sm mt-0.5">⚠</span>
                        <div className="text-sm text-amber-700">
                          <strong>제한사항:</strong> {rate.limitations.join(', ')}
                        </div>
                      </div>
                    )}
                    {/* 지원 통화 정보 */}
                    <div className="flex items-start gap-2">
                      <span className="text-blue-500 text-sm mt-0.5">💱</span>
                      <div className="text-sm text-blue-700">
                        <strong>지원 통화:</strong> {rate.supportedCurrencies.join(', ')}
                      </div>
                    </div>
                    {/* 마지막 업데이트 */}
                    <div className="text-xs text-gray-400 mt-2">
                      마지막 업데이트: {new Date(rate.lastUpdated).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 선택 표시기 */}
            {selectable && isSelected(rate.id) && (
              <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center">
                <span className="text-sm">✓</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  // 컴팩트 테이블 뷰 렌더링 (태블릿용)
  const renderCompactTableView = () => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px]">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              결제 수단
            </th>
            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              수수료율
            </th>
            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              수수료
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {paymentRates.map((rate, index) => {
            const fee = calculatePaymentFee(rate);
            const hasPromotion = promotional && fee.savings > 0;
            
            return (
              <tr 
                key={rate.id} 
                className={`transition-all duration-200 ${
                  isSelected(rate.id)
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : index % 2 === 0 
                    ? 'bg-white hover:bg-gray-50' 
                    : 'bg-gray-50 hover:bg-gray-100'
                } ${selectable ? 'cursor-pointer' : ''}`}
                onClick={() => handlePaymentClick(rate)}
                onMouseEnter={() => setHoveredPayment(rate.id)}
                onMouseLeave={() => setHoveredPayment(null)}
              >
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-sm font-semibold text-blue-600">
                        {rate.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900 text-sm">
                        {rate.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {rate.description}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-center">
                  <div className="text-sm font-medium text-gray-900">
                    {formatPercentage(rate.baseRate)}
                  </div>
                  {rate.additionalFees && rate.additionalFees > 0 && (
                    <div className="text-xs text-gray-500">
                      +{formatCurrency(rate.additionalFees, currency, { ...formatOptions, showDecimals: false })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  {hasPromotion ? (
                    <div className="space-y-1">
                      <div className="text-xs line-through text-gray-400">
                        {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                      </div>
                      <div className="font-semibold text-orange-600 text-sm">
                        {formatCurrency(Math.round(fee.discounted), currency, formatOptions)}
                      </div>
                    </div>
                  ) : (
                    <div className="font-semibold text-gray-900 text-sm">
                      {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  // 풀 테이블 뷰 렌더링 (데스크톱용)
  const renderFullTableView = () => (
    <div className="overflow-hidden border border-gray-200 rounded-lg">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              결제 수단
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              수수료율
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              수수료
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              처리시간
            </th>
            {selectable && (
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                선택
              </th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {paymentRates.map((rate, index) => {
            const fee = calculatePaymentFee(rate);
            const hasPromotion = promotional && fee.savings > 0;
            
            return (
              <tr 
                key={rate.id} 
                className={`transition-all duration-200 ${
                  isSelected(rate.id)
                    ? 'bg-blue-50 border-l-4 border-blue-500'
                    : index % 2 === 0 
                    ? 'bg-white hover:bg-gray-50' 
                    : 'bg-gray-50 hover:bg-gray-100'
                } ${selectable ? 'cursor-pointer' : ''}`}
                onClick={() => handlePaymentClick(rate)}
                onMouseEnter={() => setHoveredPayment(rate.id)}
                onMouseLeave={() => setHoveredPayment(null)}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-lg font-semibold text-blue-600">
                        {rate.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {rate.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {rate.description}
                      </div>
                      
                      {(rate.benefits || rate.limitations) && (
                        <div className="mt-1 space-y-1">
                          {rate.benefits && (
                            <div className="text-xs text-green-600">
                              ✓ {rate.benefits.join(', ')}
                            </div>
                          )}
                          {rate.limitations && (
                            <div className="text-xs text-amber-600">
                              ⚠ {rate.limitations.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {formatPercentage(rate.baseRate)}
                    </div>
                    {rate.additionalFees && rate.additionalFees > 0 && (
                      <div className="text-xs text-gray-500">
                        + {formatCurrency(rate.additionalFees, currency, { ...formatOptions, showDecimals: false })} 고정
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <div className="space-y-1">
                    {hasPromotion ? (
                      <>
                        <div className="text-sm line-through text-gray-400">
                          {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                        </div>
                        <div className="font-semibold text-orange-600">
                          {formatCurrency(Math.round(fee.discounted), currency, formatOptions)}
                        </div>
                        <div className="text-xs text-orange-500">
                          -{formatCurrency(Math.round(fee.savings), currency, formatOptions)} 절약
                        </div>
                      </>
                    ) : (
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(Math.round(fee.original), currency, formatOptions)}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4 text-center">
                  <span className="text-sm text-gray-600">
                    {rate.processingTime}
                  </span>
                </td>
                {selectable && (
                  <td className="px-4 py-4 text-center">
                    {isSelected(rate.id) ? (
                      <div className="w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto">
                        <span className="text-sm">✓</span>
                      </div>
                    ) : (
                      <div className="w-6 h-6 border-2 border-gray-300 rounded-full mx-auto"></div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={`payment-rate-table ${className} ${screenWidth < BREAKPOINTS.tablet ? 'mobile-view' : 'desktop-view'}`}>
      {/* 헤더 */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className={`font-semibold text-gray-900 ${screenWidth < BREAKPOINTS.mobile ? 'text-base' : 'text-lg'}`}>
            {tableTitle}
          </h3>
          
          {/* 뷰 모드 토글 (태블릿 이상에서만 표시) */}
          {screenWidth >= BREAKPOINTS.tablet && !isCompact && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'table' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📊 테이블
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'cards' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📇 카드
              </button>
            </div>
          )}
        </div>
        
        {promotional && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-orange-500 text-lg">🎉</span>
              <div>
                <div className="font-semibold text-orange-800 text-sm">
                  {promotional.discount}% 할인 프로모션
                </div>
                <div className="text-xs text-orange-700">
                  {promotional.description} (유효기간: {promotional.validUntil.toLocaleDateString()})
                </div>
              </div>
            </div>
          </div>
        )}
        
        <p className={`text-gray-600 ${screenWidth < BREAKPOINTS.mobile ? 'text-xs' : 'text-sm'}`}>
          {formatCurrency(region === 'korea' ? 10000 : 100, currency, formatOptions)} 기준 수수료 ({getCurrencyName(currency, 'ko')})
        </p>
      </div>

      {/* 결제 수단 목록 - 뷰 모드에 따라 다르게 렌더링 */}
      <div className="payment-rates-content">
        {viewMode === 'cards' && renderCardView()}
        {viewMode === 'compact' && renderCompactTableView()}
        {viewMode === 'table' && renderFullTableView()}
      </div>

      {/* 푸터 안내사항 */}
      <div className={`mt-4 text-gray-500 space-y-1 ${screenWidth < BREAKPOINTS.mobile ? 'text-xs' : 'text-xs'}`}>
        <p>• 수수료는 결제 금액에 따라 달라질 수 있습니다.</p>
        <p>• 환율 변동 시 실제 수수료가 상이할 수 있습니다.</p>
        {region === 'global' && (
          <p>• 해외 결제 시 추가 환율 수수료가 발생할 수 있습니다.</p>
        )}
        <p>• 자세한 수수료 정책은 각 결제 제공업체 약관을 참조하세요.</p>
      </div>
    </div>
  );
}

export default PaymentRateTable;