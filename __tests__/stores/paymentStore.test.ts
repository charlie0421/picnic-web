/**
 * stores/paymentStore.ts 테스트
 *
 * 이 테스트는 결제 모달 상태 관리 스토어를 검증합니다.
 * 테스트 대상: usePaymentStore, getPaymentProvider, getStepDisplayName 함수
 */

import { renderHook, act } from '@testing-library/react';
import { usePaymentStore, getPaymentProvider, getStepDisplayName } from '@/stores/paymentStore';
import type { PaymentStep, Region, ProductType, PaymentMethod } from '@/components/client/vote/dialogs/payment/types';

describe('paymentStore', () => {
  beforeEach(() => {
    // 각 테스트 전에 스토어 초기화
    act(() => {
      usePaymentStore.getState().resetPaymentFlow();
    });
  });

  describe('usePaymentStore 초기 상태', () => {
    it('초기 상태가 올바르게 설정된다', () => {
      const { result } = renderHook(() => usePaymentStore());

      expect(result.current.currentStep).toBe('region');
      expect(result.current.selectedRegion).toBe('korea');
      expect(result.current.selectedProduct).toBeUndefined();
      expect(result.current.selectedPaymentMethod).toBeUndefined();
      expect(result.current.paymentStatus).toBe('idle');
      expect(result.current.paymentSession).toBeUndefined();
      expect(result.current.error).toBeUndefined();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.stepHistory).toEqual(['region']);
      expect(result.current.metadata).toBeDefined();
      expect(result.current.metadata.sessionId).toBeDefined();
    });

    it('메타데이터가 올바르게 생성된다', () => {
      const { result } = renderHook(() => usePaymentStore());

      expect(result.current.metadata.startedAt).toBeGreaterThan(Date.now() - 1000);
      expect(result.current.metadata.userAgent).toBeDefined();
      expect(result.current.metadata.sessionId).toMatch(/^[a-z0-9]+$/);
    });
  });

  describe('기본 액션 테스트', () => {
    it('setCurrentStep으로 단계를 변경할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setCurrentStep('product');
      });

      expect(result.current.currentStep).toBe('product');
      expect(result.current.stepHistory).toEqual(['region', 'product']);
    });

    it('setSelectedRegion으로 지역을 변경할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setSelectedRegion('global');
      });

      expect(result.current.selectedRegion).toBe('global');
    });

    it('setSelectedProduct로 상품을 선택할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());
      const mockProduct: ProductType = {
        id: 'test_product',
        name: '테스트 상품',
        description: '테스트용 상품',
        quantity: 100,
        price: 5000,
        currency: 'KRW',
        icon: '⭐',
        category: 'stars'
      };

      act(() => {
        result.current.setSelectedProduct(mockProduct);
      });

      expect(result.current.selectedProduct).toEqual(mockProduct);
    });

    it('setSelectedPaymentMethod로 결제 수단을 선택할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());
      const mockPaymentMethod: PaymentMethod = {
        id: 'test_card',
        name: '테스트 카드',
        icon: '💳',
        provider: 'portone',
        fees: 2.9,
        supportedCurrencies: ['KRW'],
        enabled: true
      };

      act(() => {
        result.current.setSelectedPaymentMethod(mockPaymentMethod);
      });

      expect(result.current.selectedPaymentMethod).toEqual(mockPaymentMethod);
    });

    it('setPaymentStatus로 결제 상태를 변경할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setPaymentStatus('processing');
      });

      expect(result.current.paymentStatus).toBe('processing');
    });

    it('setError로 에러를 설정할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());
      const mockError = {
        code: 'TEST_ERROR',
        message: '테스트 에러',
        recoverable: true,
        retryable: true,
        timestamp: new Date()
      };

      act(() => {
        result.current.setError(mockError);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.paymentStatus).toBe('failed');
    });

    it('setLoading으로 로딩 상태를 변경할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('복합 액션 테스트', () => {
    it('initializePayment로 초기화할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());
      const mockProduct: ProductType = {
        id: 'init_product',
        name: '초기화 상품',
        description: '초기화용 상품',
        quantity: 50,
        price: 3000,
        currency: 'KRW',
        icon: '🎁',
        category: 'bonus'
      };

      act(() => {
        result.current.initializePayment('global', mockProduct);
      });

      expect(result.current.detectedRegion).toBe('global');
      expect(result.current.selectedRegion).toBe('global');
      expect(result.current.selectedProduct).toEqual(mockProduct);
      expect(result.current.currentStep).toBe('payment'); // 상품이 있으면 payment로 시작
      expect(result.current.paymentStatus).toBe('idle');
      expect(result.current.error).toBeUndefined();
    });

    it('상품 없이 initializePayment하면 region 단계로 시작한다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.initializePayment('korea');
      });

      expect(result.current.currentStep).toBe('region');
      expect(result.current.selectedProduct).toBeUndefined();
    });

    it('goBackToPreviousStep으로 이전 단계로 갈 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());

      // 여러 단계로 이동
      act(() => {
        result.current.setCurrentStep('product');
      });
      act(() => {
        result.current.setCurrentStep('payment');
      });

      // 이전 단계로 이동
      act(() => {
        result.current.goBackToPreviousStep();
      });

      expect(result.current.currentStep).toBe('product');
      expect(result.current.stepHistory).toEqual(['region', 'product']);
    });

    it('첫 단계에서 goBackToPreviousStep하면 변화가 없다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.goBackToPreviousStep();
      });

      expect(result.current.currentStep).toBe('region');
      expect(result.current.stepHistory).toEqual(['region']);
    });

    it('resetPaymentFlow로 전체 상태를 초기화할 수 있다', () => {
      const { result } = renderHook(() => usePaymentStore());
      
      // 상태 변경
      act(() => {
        result.current.setCurrentStep('payment');
        result.current.setSelectedRegion('global');
        result.current.setPaymentStatus('processing');
        result.current.setLoading(true);
      });

      // 초기화
      act(() => {
        result.current.resetPaymentFlow();
      });

      expect(result.current.currentStep).toBe('region');
      expect(result.current.selectedRegion).toBe('korea');
      expect(result.current.paymentStatus).toBe('idle');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.stepHistory).toEqual(['region']);
    });
  });

  describe('검증 로직 테스트', () => {
    it('validateCurrentStep이 region 단계를 올바르게 검증한다', () => {
      const { result } = renderHook(() => usePaymentStore());

      const validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(true); // 기본 지역이 설정되어 있음
    });

    it('validateCurrentStep이 product 단계를 올바르게 검증한다', () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setCurrentStep('product');
      });

      // 상품 선택 전
      let validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('상품을 선택해주세요.');

      // 상품 선택 후
      const mockProduct: ProductType = {
        id: 'test_product',
        name: '테스트 상품',
        description: '테스트용 상품',
        quantity: 100,
        price: 5000,
        currency: 'KRW',
        icon: '⭐',
        category: 'stars'
      };

      act(() => {
        result.current.setSelectedProduct(mockProduct);
      });

      validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(true);
    });

    it('validateCurrentStep이 payment 단계를 올바르게 검증한다', () => {
      const { result } = renderHook(() => usePaymentStore());
      const mockProduct: ProductType = {
        id: 'test_product',
        name: '테스트 상품',
        description: '테스트용 상품',
        quantity: 100,
        price: 5000,
        currency: 'KRW',
        icon: '⭐',
        category: 'stars'
      };

      act(() => {
        result.current.setCurrentStep('payment');
        result.current.setSelectedProduct(mockProduct);
      });

      // 결제 수단 선택 전
      let validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(false);
      expect(validation.error).toBe('결제 수단을 선택해주세요.');

      // 결제 수단 선택 후
      const mockPaymentMethod: PaymentMethod = {
        id: 'test_card',
        name: '테스트 카드',
        icon: '💳',
        provider: 'portone',
        fees: 2.9,
        supportedCurrencies: ['KRW'],
        enabled: true
      };

      act(() => {
        result.current.setSelectedPaymentMethod(mockPaymentMethod);
      });

      validation = result.current.validateCurrentStep();
      expect(validation.isValid).toBe(true);
    });

    it('canProceedToNextStep이 검증 결과와 일치한다', () => {
      const { result } = renderHook(() => usePaymentStore());

      expect(result.current.canProceedToNextStep()).toBe(true); // region 단계는 기본값으로 유효

      act(() => {
        result.current.setCurrentStep('product');
      });

      expect(result.current.canProceedToNextStep()).toBe(false); // 상품 선택 안됨
    });
  });

  describe('proceedToNextStep 비동기 액션 테스트', () => {
    it('유효한 단계에서 proceedToNextStep이 성공한다', async () => {
      const { result } = renderHook(() => usePaymentStore());

      let success: boolean = false;
      await act(async () => {
        success = await result.current.proceedToNextStep();
      });

      expect(success).toBe(true);
      expect(result.current.currentStep).toBe('product');
      expect(result.current.error).toBeUndefined();
    });

    it('유효하지 않은 단계에서 proceedToNextStep이 실패한다', async () => {
      const { result } = renderHook(() => usePaymentStore());

      act(() => {
        result.current.setCurrentStep('product'); // 상품 선택 안된 상태
      });

      let success: boolean = true;
      await act(async () => {
        success = await result.current.proceedToNextStep();
      });

      expect(success).toBe(false);
      expect(result.current.error).toBeDefined();
      expect(result.current.error?.code).toBe('VALIDATION_ERROR');
    });
  });
});

describe('헬퍼 함수 테스트', () => {
  describe('getPaymentProvider', () => {
    it('korea 지역에 대해 portone을 반환한다', () => {
      expect(getPaymentProvider('korea')).toBe('portone');
    });

    it('global 지역에 대해 paypal을 반환한다', () => {
      expect(getPaymentProvider('global')).toBe('paypal');
    });
  });

  describe('getStepDisplayName', () => {
    it('모든 단계에 대해 한국어 이름을 반환한다', () => {
      const steps: PaymentStep[] = ['region', 'product', 'payment', 'review', 'processing', 'success', 'error'];
      const expectedNames = ['지역 선택', '상품 선택', '결제 수단', '결제 확인', '결제 중', '결제 완료', '결제 실패'];

      steps.forEach((step, index) => {
        expect(getStepDisplayName(step)).toBe(expectedNames[index]);
      });
    });

    it('알 수 없는 단계에 대해 단계 이름 자체를 반환한다', () => {
      const unknownStep = 'unknown_step' as PaymentStep;
      expect(getStepDisplayName(unknownStep)).toBe(unknownStep);
    });
  });
});

describe('스토어 통합 테스트', () => {
  it('여러 컴포넌트에서 동일한 스토어 상태를 공유한다', () => {
    const { result: result1 } = renderHook(() => usePaymentStore());
    const { result: result2 } = renderHook(() => usePaymentStore());

    act(() => {
      result1.current.setSelectedRegion('global');
    });

    expect(result2.current.selectedRegion).toBe('global');
  });

  it('한 곳에서 resetPaymentFlow를 호출하면 모든 곳에서 초기화된다', () => {
    const { result: result1 } = renderHook(() => usePaymentStore());
    const { result: result2 } = renderHook(() => usePaymentStore());

    // 첫 번째 훅에서 상태 변경
    act(() => {
      result1.current.setCurrentStep('payment');
      result1.current.setSelectedRegion('global');
    });

    // 두 번째 훅에서 초기화
    act(() => {
      result2.current.resetPaymentFlow();
    });

    // 첫 번째 훅에서도 초기화되었는지 확인
    expect(result1.current.currentStep).toBe('region');
    expect(result1.current.selectedRegion).toBe('korea');
  });

  it('전체 결제 플로우를 시뮬레이션할 수 있다', async () => {
    const { result } = renderHook(() => usePaymentStore());

    // 1. 초기화
    act(() => {
      result.current.initializePayment('korea');
    });

    // 2. 상품 선택
    const mockProduct: ProductType = {
      id: 'flow_product',
      name: '플로우 테스트 상품',
      description: '플로우 테스트용 상품',
      quantity: 100,
      price: 10000,
      currency: 'KRW',
      icon: '💎',
      category: 'premium'
    };

    await act(async () => {
      await result.current.proceedToNextStep(); // region -> product
      result.current.setSelectedProduct(mockProduct);
      await result.current.proceedToNextStep(); // product -> payment
    });

    expect(result.current.currentStep).toBe('payment');

    // 3. 결제 수단 선택
    const mockPaymentMethod: PaymentMethod = {
      id: 'flow_card',
      name: '플로우 테스트 카드',
      icon: '💳',
      provider: 'portone',
      fees: 2.9,
      supportedCurrencies: ['KRW'],
      enabled: true
    };

    await act(async () => {
      result.current.setSelectedPaymentMethod(mockPaymentMethod);
      await result.current.proceedToNextStep(); // payment -> review
    });

    expect(result.current.currentStep).toBe('review');
    expect(result.current.selectedProduct).toEqual(mockProduct);
    expect(result.current.selectedPaymentMethod).toEqual(mockPaymentMethod);
  });
});