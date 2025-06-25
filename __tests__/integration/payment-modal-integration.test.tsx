/**
 * PaymentModal 통합 테스트
 * 
 * PaymentModal 컴포넌트와 paymentStore의 통합 동작을 검증합니다.
 * 실제 사용자 시나리오를 시뮬레이션하여 전체 결제 플로우를 테스트합니다.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PaymentModal } from '@/components/client/vote/dialogs/payment/PaymentModal';
import { usePaymentStore } from '@/stores/paymentStore';
import type { PaymentModalProps, ProductType, PaymentMethod, PaymentReceipt, PaymentError } from '@/components/client/vote/dialogs/payment/types';

// Store는 실제 store를 사용 (mock하지 않음)
// Dialog 컴포넌트 mock (실제 렌더링 복잡성 제거)
jest.mock('@/components/ui/Dialog', () => ({
  Dialog: ({ isOpen, children, onClose, title }: any) => 
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <button onClick={onClose} aria-label="close">×</button>
        {children}
      </div>
    ) : null
}));

// 테스트용 wrapper 컴포넌트
const PaymentModalTestWrapper = (props: Partial<PaymentModalProps> & { 
  onStoreStateChange?: (state: any) => void 
}) => {
  const storeState = usePaymentStore();
  
  React.useEffect(() => {
    if (props.onStoreStateChange) {
      props.onStoreStateChange(storeState);
    }
  }, [storeState, props.onStoreStateChange]);

  return (
    <PaymentModal
      isOpen={true}
      onClose={jest.fn()}
      detectedRegion="korea"
      onPaymentSuccess={jest.fn()}
      onPaymentError={jest.fn()}
      onPaymentCancel={jest.fn()}
      {...props}
    />
  );
};

describe('PaymentModal 통합 테스트', () => {
  let storeStateLog: any[] = [];

  const captureStoreState = (state: any) => {
    storeStateLog.push({
      step: state.currentStep,
      region: state.selectedRegion,
      product: state.selectedProduct?.name,
      paymentMethod: state.selectedPaymentMethod?.name,
      isLoading: state.isLoading,
      error: state.error?.code
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    storeStateLog = [];
    
    // Store 초기화
    act(() => {
      usePaymentStore.getState().resetPaymentFlow();
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('전체 결제 플로우 통합 테스트', () => {
    test('Korea 지역 카드결제 성공 플로우', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      const onPaymentSuccess = jest.fn();

      render(
        <PaymentModalTestWrapper 
          detectedRegion="korea"
          onPaymentSuccess={onPaymentSuccess}
          onStoreStateChange={captureStoreState}
        />
      );

      // 1단계: 지역 선택 (Korea 기본 선택됨)
      expect(screen.getByText('🌍 지역 선택')).toBeInTheDocument();
      expect(screen.getByText('🇰🇷 Korea')).toBeInTheDocument();

      // 다음 단계로
      const nextButton = screen.getByText('다음');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      // 2단계: 상품 선택 (별사탕)
      const starProduct = screen.getByText('별사탕').closest('button');
      await user.click(starProduct!);

      // 선택된 상품 확인
      await waitFor(() => {
        expect(screen.getByText('선택된 상품: 별사탕 100개')).toBeInTheDocument();
      });

      // 다음 단계로
      const nextButton2 = screen.getByText('다음');
      await user.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByText('💰 결제 수단')).toBeInTheDocument();
      });

      // 3단계: 결제 수단 선택 (카드결제)
      const cardPayment = screen.getByText('카드결제').closest('button');
      await user.click(cardPayment!);

      // 선택된 결제 수단 확인
      await waitFor(() => {
        expect(screen.getByText('선택된 결제 수단: 카드결제')).toBeInTheDocument();
      });

      // 다음 단계로
      const nextButton3 = screen.getByText('다음');
      await user.click(nextButton3);

      await waitFor(() => {
        expect(screen.getByText('📊 결제 정보 확인')).toBeInTheDocument();
      });

      // 4단계: 결제 정보 확인
      expect(screen.getByText('별사탕 100개')).toBeInTheDocument();
      expect(screen.getByText('₩5,000')).toBeInTheDocument();
      expect(screen.getByText('카드결제')).toBeInTheDocument();

      // 결제 시작
      const payButton = screen.getByText('결제하기');
      await user.click(payButton);

      // 로딩 상태 확인
      await waitFor(() => {
        expect(screen.getByText('처리 중...')).toBeInTheDocument();
      });

      // 2초 후 결제 완료 (PaymentModal의 mock 결제 처리)
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(screen.getByText('🎉 결제 완료')).toBeInTheDocument();
        expect(screen.getByText('결제가 성공적으로 완료되었습니다!')).toBeInTheDocument();
      });

      // Store 상태 변경 로그 검증
      const finalLog = storeStateLog[storeStateLog.length - 1];
      expect(finalLog.step).toBe('success');
      expect(finalLog.product).toBe('별사탕');
      expect(finalLog.paymentMethod).toBe('카드결제');
    });

    test('Global 지역 PayPal 결제 성공 플로우', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <PaymentModalTestWrapper 
          detectedRegion="global"
          onStoreStateChange={captureStoreState}
        />
      );

      // Global 지역 선택
      const globalButton = screen.getByText('🌏 Global');
      await user.click(globalButton);

      // 다음 단계로
      const nextButton = screen.getByText('다음');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      // 프리미엄 상품 선택
      const premiumProduct = screen.getByText('프리미엄').closest('button');
      await user.click(premiumProduct!);

      // 다음 단계로
      const nextButton2 = screen.getByText('다음');
      await user.click(nextButton2);

      await waitFor(() => {
        expect(screen.getByText('PayPal을 통한 결제 수단을 선택해주세요.')).toBeInTheDocument();
      });

      // PayPal 선택
      const paypalPayment = screen.getByText('PayPal').closest('button');
      await user.click(paypalPayment!);

      // 다음 단계로
      const nextButton3 = screen.getByText('다음');
      await user.click(nextButton3);

      // 결제 정보 확인에서 USD 표시 확인
      await waitFor(() => {
        expect(screen.getByText('프리미엄 20개')).toBeInTheDocument();
        // Global 지역과 PayPal 확인
        expect(screen.getByText('🌏 Global')).toBeInTheDocument();
        expect(screen.getByText('paypal')).toBeInTheDocument();
      });

      // Store 상태 검증
      const finalLog = storeStateLog[storeStateLog.length - 1];
      expect(finalLog.region).toBe('global');
      expect(finalLog.product).toBe('프리미엄');
      expect(finalLog.paymentMethod).toBe('PayPal');
    });
  });

  describe('에러 처리 통합 테스트', () => {
    test('결제 실패 후 재시도 플로우', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      // Store의 결제 처리를 에러로 만들기 위해 임시로 수정
      const originalHandlePaymentProcess = PaymentModal.prototype;

      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // 빠르게 review 단계까지 이동
      act(() => {
        const store = usePaymentStore.getState();
        store.setCurrentStep('review');
        store.setSelectedProduct({
          id: 'test_stars',
          name: '별사탕',
          description: '테스트용',
          quantity: 100,
          price: 5000,
          currency: 'KRW',
          icon: '⭐',
          category: 'stars'
        });
        store.setSelectedPaymentMethod({
          id: 'test_card',
          name: '카드결제',
          icon: '💳',
          provider: 'portone',
          fees: 2.9,
          supportedCurrencies: ['KRW'],
          enabled: true
        });
      });

      await waitFor(() => {
        expect(screen.getByText('📊 결제 정보 확인')).toBeInTheDocument();
      });

      // 에러를 발생시키기 위해 store에 에러 설정
      act(() => {
        usePaymentStore.getState().setError({
          code: 'PAYMENT_FAILED',
          message: '결제 처리 중 오류가 발생했습니다.',
          recoverable: true,
          retryable: true,
          timestamp: new Date()
        });
        usePaymentStore.getState().setCurrentStep('error');
      });

      await waitFor(() => {
        expect(screen.getByText('❌ 결제 실패')).toBeInTheDocument();
        expect(screen.getByText('결제 처리 중 오류가 발생했습니다.')).toBeInTheDocument();
      });

      // 재시도 버튼 클릭
      const retryButton = screen.getByText('다시 시도');
      await user.click(retryButton);

      // 에러 메시지가 사라지고 review 단계로 돌아감
      await waitFor(() => {
        expect(screen.getByText('📊 결제 정보 확인')).toBeInTheDocument();
        expect(screen.queryByText('❌ 결제 실패')).not.toBeInTheDocument();
      });

      // Store 로그에서 error -> review 전환 확인
      const errorToReviewTransition = storeStateLog.find(log => 
        log.step === 'review' && storeStateLog.indexOf(log) > 0
      );
      expect(errorToReviewTransition).toBeDefined();
    });

    test('검증 에러 처리', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // 상품 선택 없이 다음 단계로 시도
      act(() => {
        usePaymentStore.getState().setCurrentStep('product');
      });

      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      // 상품 선택 없이 다음 버튼 클릭
      const nextButton = screen.getByText('다음');
      expect(nextButton).toBeDisabled(); // canProceedToNextStep이 false이므로

      // 상품 선택 후 활성화 확인
      const starProduct = screen.getByText('별사탕').closest('button');
      await user.click(starProduct!);

      await waitFor(() => {
        const nextButton = screen.getByText('다음');
        expect(nextButton).toBeEnabled();
      });
    });
  });

  describe('접근성 통합 테스트', () => {
    test('키보드 네비게이션 전체 플로우', async () => {
      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // Escape 키로 모달 닫기
      const onClose = jest.fn();
      render(
        <PaymentModalTestWrapper 
          onClose={onClose}
        />
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });

    test('포커스 관리', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <PaymentModalTestWrapper />
      );

      // 단계 변경 시 메인 컨텐츠에 포커스
      const nextButton = screen.getByText('다음');
      await user.click(nextButton);

      // 100ms 후 포커스가 메인 컨텐츠로 이동하는지 확인
      act(() => {
        jest.advanceTimersByTime(100);
      });

      await waitFor(() => {
        const mainContent = screen.getByLabelText(/결제 단계.*상품 선택/);
        expect(document.activeElement).toBe(mainContent);
      });
    });
  });

  describe('성능 및 안정성 테스트', () => {
    test('빠른 연속 클릭 처리', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // 다음 버튼 빠르게 여러 번 클릭
      const nextButton = screen.getByText('다음');
      await user.click(nextButton);
      await user.click(nextButton);
      await user.click(nextButton);

      // 한 번만 실행되어야 함
      await waitFor(() => {
        const productSteps = storeStateLog.filter(log => log.step === 'product');
        expect(productSteps.length).toBeLessThanOrEqual(2); // 초기값 + 변경값
      });
    });

    test('메모리 누수 방지 - 컴포넌트 언마운트 시 리스너 정리', () => {
      const addEventListenerSpy = jest.spyOn(document, 'addEventListener');
      const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

      const { unmount } = render(
        <PaymentModalTestWrapper />
      );

      // 이벤트 리스너 등록 확인
      expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      // 컴포넌트 언마운트
      unmount();

      // 이벤트 리스너 제거 확인
      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      addEventListenerSpy.mockRestore();
      removeEventListenerSpy.mockRestore();
    });

    test('store 상태 동기화 안정성', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      // 두 개의 모달 렌더링 (store 공유 확인)
      const { rerender } = render(
        <PaymentModalTestWrapper 
          key="modal1"
          onStoreStateChange={captureStoreState}
        />
      );

      // 첫 번째 모달에서 상태 변경
      const globalButton = screen.getByText('🌏 Global');
      await user.click(globalButton);

      // 두 번째 모달로 교체
      rerender(
        <PaymentModalTestWrapper 
          key="modal2"
          onStoreStateChange={captureStoreState}
        />
      );

      // 상태가 유지되는지 확인
      await waitFor(() => {
        // Global 버튼이 선택된 상태여야 함
        const globalButton = screen.getByText('🌏 Global');
        expect(globalButton.closest('button')).toHaveClass('border-blue-500');
      });
    });
  });

  describe('실제 사용 시나리오 테스트', () => {
    test('사용자가 중간에 마음을 바꾸는 시나리오', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // 1. 처음에 Korea 선택하고 다음으로
      const nextButton1 = screen.getByText('다음');
      await user.click(nextButton1);

      // 2. 별사탕 선택하고 다음으로
      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      const starProduct = screen.getByText('별사탕').closest('button');
      await user.click(starProduct!);

      const nextButton2 = screen.getByText('다음');
      await user.click(nextButton2);

      // 3. 결제 수단에서 마음을 바꿔 이전으로
      await waitFor(() => {
        expect(screen.getByText('💰 결제 수단')).toBeInTheDocument();
      });

      const backButton = screen.getByText('이전');
      await user.click(backButton);

      // 4. 다른 상품으로 변경
      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      const premiumProduct = screen.getByText('프리미엄').closest('button');
      await user.click(premiumProduct!);

      // 5. 최종 선택 확인
      await waitFor(() => {
        expect(screen.getByText('선택된 상품: 프리미엄 20개')).toBeInTheDocument();
      });

      // Store 로그에서 변경 내역 추적
      const productChanges = storeStateLog.filter(log => log.product);
      expect(productChanges.some(log => log.product === '별사탕')).toBe(true);
      expect(productChanges.some(log => log.product === '프리미엄')).toBe(true);
    });

    test('모바일 환경 시뮬레이션 (빠른 탭)', async () => {
      const user = userEvent.setup({ 
        advanceTimers: jest.advanceTimersByTime,
        delay: null // 모바일의 빠른 탭 시뮬레이션
      });

      render(
        <PaymentModalTestWrapper 
          onStoreStateChange={captureStoreState}
        />
      );

      // 매우 빠른 연속 동작
      const globalButton = screen.getByText('🌏 Global');
      await user.click(globalButton);

      const nextButton = screen.getByText('다음');
      await user.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      });

      const starProduct = screen.getByText('별사탕').closest('button');
      await user.click(starProduct!);

      // 상태가 올바르게 업데이트되었는지 확인
      const finalState = storeStateLog[storeStateLog.length - 1];
      expect(finalState.region).toBe('global');
      expect(finalState.product).toBe('별사탕');
    });
  });
});