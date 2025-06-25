'use client';

import { useMemo } from 'react';
import type { Region, PaymentProvider, PaymentMethod, Currency, PaymentRateTableProps } from './types';
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
 * Payment Rate Table 컴포넌트
 * 지역별 결제 수단과 수수료를 표 형태로 표시합니다.
 */
export function PaymentRateTable({
  region,
  currency = region === 'korea' ? 'KRW' : 'USD',
  isCompact = false,
  showOnly,
  promotional,
  title,
  className = ''
}: PaymentRateTableProps) {
  // 지역별 결제 수단 필터링
  const paymentRates = useMemo(() => {
    let rates = PAYMENT_RATES[region] || [];
    
    // 특정 결제 수단만 표시
    if (showOnly && showOnly.length > 0) {
      rates = rates.filter(rate => showOnly.includes(rate.id));
    }
    
    // 통화 지원 확인
    rates = rates.filter(rate => 
      rate.supportedCurrencies.includes(currency)
    );
    
    return rates;
  }, [region, showOnly, currency]);

  // 통화 포맷팅 옵션
  const formatOptions: FormatCurrencyOptions = {
    showDecimals: true,
    showThousandsSeparator: true,
    showSymbol: true,
    showCurrencyCode: false
  };

  // 수수료 계산 (예시 금액 10,000원/100달러 기준)
  const calculatePaymentFee = (rate: PaymentRateInfo, amount: number = region === 'korea' ? 10000 : 100) => {
    // 기본 수수료 계산
    const feeCalc = calculateFee(amount, rate.baseRate, currency, rate.additionalFees || 0);
    
    // 프로모션 할인 적용
    if (promotional) {
      const discount = (feeCalc.feeAmount * promotional.discount) / 100;
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

  // 제목 생성
  const tableTitle = title || `${region === 'korea' ? '🇰🇷 한국' : '🌏 해외'} 결제 수수료`;

  return (
    <div className={`payment-rate-table ${className}`}>
      {/* 헤더 */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          {tableTitle}
        </h3>
        
        {promotional && (
          <div className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-orange-500 text-lg">🎉</span>
              <div>
                <div className="font-semibold text-orange-800">
                  {promotional.discount}% 할인 프로모션
                </div>
                <div className="text-sm text-orange-700">
                  {promotional.description} (유효기간: {promotional.validUntil.toLocaleDateString()})
                </div>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-sm text-gray-600">
          {formatCurrency(region === 'korea' ? 10000 : 100, currency, formatOptions)} 기준 수수료 ({getCurrencyName(currency, 'ko')})
        </p>
      </div>

      {/* 테이블 */}
      <div className="overflow-hidden border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                결제 수단
              </th>
              {!isCompact && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  수수료율
                </th>
              )}
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                수수료
              </th>
              {!isCompact && (
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  처리시간
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paymentRates.map((rate, index) => {
              const fee = calculatePaymentFee(rate);
              const hasPromotion = promotional && fee.savings > 0;
              
              return (
                <tr key={rate.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  {/* 결제 수단 */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xl" role="img" aria-label={rate.name}>
                        {rate.icon}
                      </span>
                      <div>
                        <div className="font-medium text-gray-900">
                          {rate.name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {rate.description}
                        </div>
                        
                        {/* 장점/제한사항 (컴팩트 모드가 아닐 때) */}
                        {!isCompact && (rate.benefits || rate.limitations) && (
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

                  {/* 수수료율 (컴팩트 모드가 아닐 때) */}
                  {!isCompact && (
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
                  )}

                  {/* 수수료 */}
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

                  {/* 처리시간 (컴팩트 모드가 아닐 때) */}
                  {!isCompact && (
                    <td className="px-4 py-4 text-center">
                      <span className="text-sm text-gray-600">
                        {rate.processingTime}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 푸터 안내사항 */}
      <div className="mt-4 text-xs text-gray-500 space-y-1">
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