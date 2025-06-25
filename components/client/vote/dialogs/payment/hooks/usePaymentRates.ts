import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Region, Currency, PaymentProvider } from '../types';

/**
 * API 응답에서 받아오는 결제 요율 데이터
 */
export interface PaymentRateApiData {
  id: string;
  name: string;
  provider: PaymentProvider;
  region: Region;
  currency: Currency;
  baseRate: number;
  additionalFees?: number;
  minAmount?: number;
  maxAmount?: number;
  isActive: boolean;
  processingTime: string;
  description?: string;
  benefits?: string[];
  limitations?: string[];
  supportedCurrencies: Currency[];
  lastUpdated: string;
  // 프로모션 정보
  promotion?: {
    id: string;
    discount: number;
    validFrom: string;
    validUntil: string;
    description: string;
    isActive: boolean;
  };
}

/**
 * 결제 요율 API 요청 파라미터
 */
export interface PaymentRatesQuery {
  region: Region;
  currency?: Currency;
  provider?: PaymentProvider;
  includeInactive?: boolean;
  includePromotions?: boolean;
}

/**
 * 결제 요율 업데이트를 위한 뮤테이션 파라미터
 */
export interface UpdatePaymentRateParams {
  rateId: string;
  baseRate?: number;
  additionalFees?: number;
  isActive?: boolean;
  promotion?: {
    id: string;
    discount: number;
    validFrom: string;
    validUntil: string;
    description: string;
    isActive: boolean;
  };
}

/**
 * Mock API 서비스 - 실제 구현시에는 실제 API 엔드포인트로 교체
 */
class PaymentRatesService {
  private static readonly BASE_URL = '/api/payment-rates';
  
  /**
   * 결제 요율 목록 조회
   */
  static async getRates(params: PaymentRatesQuery): Promise<PaymentRateApiData[]> {
    // Mock 구현 - 실제로는 fetch API 사용
    await new Promise(resolve => setTimeout(resolve, 500)); // 네트워크 지연 시뮬레이션
    
    return [
      // 한국 결제 수단 Mock 데이터
      ...(params.region === 'korea' ? [
        {
          id: 'kr-card-001',
          name: '카드결제',
          provider: 'portone' as PaymentProvider,
          region: 'korea' as Region,
          currency: 'KRW' as Currency,
          baseRate: 2.9,
          additionalFees: 0,
          minAmount: 1000,
          maxAmount: 10000000,
          isActive: true,
          processingTime: '즉시',
          description: '신용카드/체크카드',
          benefits: ['즉시 결제', '포인트 적립', '무이자 할부'],
          limitations: ['일일 한도', '해외카드 제한'],
          supportedCurrencies: ['KRW'] as Currency[],
          lastUpdated: new Date().toISOString(),
          promotion: {
            id: 'promo-001',
            discount: 10,
            validFrom: new Date().toISOString(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            description: '신규 가맹점 할인',
            isActive: true
          }
        },
        {
          id: 'kr-bank-001',
          name: '계좌이체',
          provider: 'portone' as PaymentProvider,
          region: 'korea' as Region,
          currency: 'KRW' as Currency,
          baseRate: 1.5,
          additionalFees: 300,
          minAmount: 1000,
          maxAmount: 50000000,
          isActive: true,
          processingTime: '즉시-5분',
          description: '실시간 계좌이체',
          benefits: ['낮은 수수료', '안전한 결제'],
          limitations: ['은행 영업시간', '이체 한도'],
          supportedCurrencies: ['KRW'] as Currency[],
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'kr-easy-001',
          name: '간편결제',
          provider: 'portone' as PaymentProvider,
          region: 'korea' as Region,
          currency: 'KRW' as Currency,
          baseRate: 3.3,
          additionalFees: 0,
          minAmount: 1000,
          maxAmount: 3000000,
          isActive: true,
          processingTime: '즉시',
          description: '카카오페이, 삼성페이 등',
          benefits: ['편리한 결제', '빠른 처리'],
          limitations: ['앱 설치 필요', '간편결제 등록'],
          supportedCurrencies: ['KRW'] as Currency[],
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'kr-mobile-001',
          name: '휴대폰결제',
          provider: 'portone' as PaymentProvider,
          region: 'korea' as Region,
          currency: 'KRW' as Currency,
          baseRate: 3.9,
          additionalFees: 0,
          minAmount: 1000,
          maxAmount: 300000,
          isActive: true,
          processingTime: '즉시',
          description: '휴대폰 소액결제',
          benefits: ['간편 인증', '통신비 합산'],
          limitations: ['월 한도', '통신사별 차이'],
          supportedCurrencies: ['KRW'] as Currency[],
          lastUpdated: new Date().toISOString()
        }
      ] : []),
      
      // 해외 결제 수단 Mock 데이터
      ...(params.region === 'global' ? [
        {
          id: 'gl-paypal-001',
          name: 'PayPal',
          provider: 'paypal' as PaymentProvider,
          region: 'global' as Region,
          currency: params.currency || 'USD' as Currency,
          baseRate: 3.4,
          additionalFees: 0,
          minAmount: 1,
          maxAmount: 10000,
          isActive: true,
          processingTime: '즉시',
          description: 'PayPal 잔액/카드',
          benefits: ['구매자 보호', '전세계 사용'],
          limitations: ['환율 수수료', '계정 필요'],
          supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY'] as Currency[],
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'gl-credit-001',
          name: 'Credit Card',
          provider: 'paypal' as PaymentProvider,
          region: 'global' as Region,
          currency: params.currency || 'USD' as Currency,
          baseRate: 2.9,
          additionalFees: 0.30,
          minAmount: 1,
          maxAmount: 25000,
          isActive: true,
          processingTime: '즉시-24시간',
          description: 'Visa, MasterCard, Amex',
          benefits: ['포인트/마일리지', '여행 보험'],
          limitations: ['신용 한도', '해외 수수료'],
          supportedCurrencies: ['USD', 'EUR', 'GBP'] as Currency[],
          lastUpdated: new Date().toISOString()
        },
        {
          id: 'gl-debit-001',
          name: 'Debit Card',
          provider: 'paypal' as PaymentProvider,
          region: 'global' as Region,
          currency: params.currency || 'USD' as Currency,
          baseRate: 1.9,
          additionalFees: 0.30,
          minAmount: 1,
          maxAmount: 5000,
          isActive: true,
          processingTime: '즉시',
          description: '직불카드',
          benefits: ['즉시 출금', '낮은 수수료'],
          limitations: ['잔액 한도', '일부 혜택 제한'],
          supportedCurrencies: ['USD', 'EUR'] as Currency[],
          lastUpdated: new Date().toISOString()
        }
      ] : [])
    ];
  }

  /**
   * 특정 결제 요율 정보 조회
   */
  static async getRate(rateId: string): Promise<PaymentRateApiData | null> {
    // Mock 구현
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const allRates = await this.getRates({ region: 'korea' });
    const globalRates = await this.getRates({ region: 'global' });
    
    return [...allRates, ...globalRates].find(rate => rate.id === rateId) || null;
  }

  /**
   * 결제 요율 업데이트
   */
  static async updateRate(params: UpdatePaymentRateParams): Promise<PaymentRateApiData> {
    // Mock 구현
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const existingRate = await this.getRate(params.rateId);
    if (!existingRate) {
      throw new Error('결제 요율을 찾을 수 없습니다.');
    }

    return {
      ...existingRate,
      ...params,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * 결제 요율 새로고침 (캐시 무효화)
   */
  static async refreshRates(): Promise<void> {
    // Mock 구현 - 실제로는 서버 캐시 갱신 요청
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * 결제 요율 조회 React Query 훅
 */
export function usePaymentRates(params: PaymentRatesQuery) {
  return useQuery({
    queryKey: ['payment-rates', params],
    queryFn: () => PaymentRatesService.getRates(params),
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 10 * 60 * 1000, // 10분 (cacheTime의 새로운 이름)
    refetchInterval: 30 * 1000, // 30초마다 자동 갱신
    refetchIntervalInBackground: false,
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000)
  });
}

/**
 * 특정 결제 요율 조회 React Query 훅
 */
export function usePaymentRate(rateId: string | null) {
  return useQuery({
    queryKey: ['payment-rate', rateId],
    queryFn: () => rateId ? PaymentRatesService.getRate(rateId) : null,
    enabled: !!rateId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000
  });
}

/**
 * 결제 요율 업데이트 뮤테이션 훅
 */
export function useUpdatePaymentRate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: PaymentRatesService.updateRate,
    onSuccess: (updatedRate) => {
      // 특정 요율 캐시 업데이트
      queryClient.setQueryData(['payment-rate', updatedRate.id], updatedRate);
      
      // 관련된 요율 목록 캐시 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['payment-rates'],
        exact: false 
      });
    },
    onError: (error) => {
      console.error('결제 요율 업데이트 실패:', error);
    }
  });
}

/**
 * 결제 요율 새로고침 뮤테이션 훅
 */
export function useRefreshPaymentRates() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: PaymentRatesService.refreshRates,
    onSuccess: () => {
      // 모든 결제 요율 관련 캐시 무효화
      queryClient.invalidateQueries({ 
        queryKey: ['payment-rates'],
        exact: false 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['payment-rate'],
        exact: false 
      });
    }
  });
}

/**
 * 필터링된 결제 요율 훅 (클라이언트 사이드 필터링 포함)
 */
export function useFilteredPaymentRates(
  params: PaymentRatesQuery,
  options?: {
    showOnly?: string[];
    includePromotions?: boolean;
    sortBy?: 'rate' | 'name' | 'processing-time';
    sortOrder?: 'asc' | 'desc';
  }
) {
  const { data: rates, ...queryResult } = usePaymentRates(params);

  const filteredAndSortedRates = useMemo(() => {
    if (!rates) return [];

    let filtered = rates;

    // showOnly 필터
    if (options?.showOnly && options.showOnly.length > 0) {
      filtered = filtered.filter(rate => 
        options.showOnly!.some(id => rate.id.includes(id) || rate.name.includes(id))
      );
    }

    // 프로모션 필터
    if (options?.includePromotions === false) {
      filtered = filtered.filter(rate => !rate.promotion?.isActive);
    }

    // 정렬
    if (options?.sortBy) {
      filtered = [...filtered].sort((a, b) => {
        let comparison = 0;

        switch (options.sortBy) {
          case 'rate':
            comparison = a.baseRate - b.baseRate;
            break;
          case 'name':
            comparison = a.name.localeCompare(b.name);
            break;
          case 'processing-time':
            // 간단한 처리시간 정렬 (즉시 < 분 < 시간)
            const getTimeValue = (time: string) => {
              if (time.includes('즉시')) return 0;
              if (time.includes('분')) return 1;
              if (time.includes('시간')) return 2;
              return 3;
            };
            comparison = getTimeValue(a.processingTime) - getTimeValue(b.processingTime);
            break;
        }

        return options.sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    return filtered;
  }, [rates, options]);

  return {
    ...queryResult,
    data: filteredAndSortedRates,
    originalData: rates
  };
}

/**
 * 결제 요율 통계 훅
 */
export function usePaymentRatesStats(region: Region, currency: Currency) {
  const { data: rates } = usePaymentRates({ region, currency });

  return useMemo(() => {
    if (!rates || rates.length === 0) {
      return {
        total: 0,
        active: 0,
        withPromotions: 0,
        averageRate: 0,
        lowestRate: 0,
        highestRate: 0
      };
    }

    const activeRates = rates.filter(rate => rate.isActive);
    const ratesWithPromotions = rates.filter(rate => rate.promotion?.isActive);
    const rateFees = activeRates.map(rate => rate.baseRate);

    return {
      total: rates.length,
      active: activeRates.length,
      withPromotions: ratesWithPromotions.length,
      averageRate: rateFees.reduce((sum, rate) => sum + rate, 0) / rateFees.length,
      lowestRate: Math.min(...rateFees),
      highestRate: Math.max(...rateFees)
    };
  }, [rates]);
}

export default PaymentRatesService;