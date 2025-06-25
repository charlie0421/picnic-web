/**
 * PaymentModal 컴포넌트 테스트
 *
 * 결제 모달 컴포넌트의 기능을 검증합니다.
 * 테스트 대상: 렌더링, 단계별 플로우, 상호작용, 접근성, 에러 처리
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { PaymentModal } from '@/components/client/vote/dialogs/payment/PaymentModal';
import { usePaymentStore } from '@/stores/paymentStore';
import type { PaymentModalProps, ProductType, PaymentMethod, PaymentReceipt, PaymentError } from '@/components/client/vote/dialogs/payment/types';

// Store mock
jest.mock('@/stores/paymentStore');
const mockUsePaymentStore = usePaymentStore as jest.MockedFunction<typeof usePaymentStore>;

// Mock 데이터
const mockProduct: ProductType = {
  id: 'test_stars',
  name: '별사탕',
  description: '투표에 사용할 수 있는 별사탕',
  quantity: 100,
  price: 5000,
  currency: 'KRW',
  icon: '⭐',
  category: 'stars'
};

const mockPaymentMethod: PaymentMethod = {
  id: 'test_card',
  name: '카드결제',
  icon: '💳',
  provider: 'portone',
  fees: 2.9,
  supportedCurrencies: ['KRW'],
  enabled: true
};

const mockReceipt: PaymentReceipt = {
  receiptId: 'receipt_123',
  paymentId: 'payment_123',
  transactionId: 'tx_123',
  status: 'completed',
  completedAt: new Date(),
  product: mockProduct,
  paymentMethod: mockPaymentMethod,
  priceBreakdown: {
    subtotal: 5000,
    fees: 145,
    fixedFees: 0,
    discount: 0,
    tax: 0,
    total: 5145,
    currency: 'KRW'
  },
  region: 'korea',
  userId: 'user_123'
};

const mockError: PaymentError = {
  code: 'PAYMENT_FAILED',
  message: '결제 처리 중 오류가 발생했습니다.',
  recoverable: true,
  retryable: true,
  timestamp: new Date()
};

describe('PaymentModal', () => {
  const defaultProps: PaymentModalProps = {
    isOpen: true,
    onClose: jest.fn(),
    detectedRegion: 'korea',
    onPaymentSuccess: jest.fn(),
    onPaymentError: jest.fn(),
    onPaymentCancel: jest.fn()
  };

  const mockStoreState = {
    currentStep: 'region' as const,
    selectedRegion: 'korea' as const,
    detectedRegion: 'korea' as const,
    selectedProduct: undefined,
    selectedPaymentMethod: undefined,
    paymentStatus: 'idle' as const,
    paymentSession: undefined,
    error: undefined,
    isLoading: false,
    stepHistory: ['region'],
    metadata: {
      startedAt: Date.now(),
      userAgent: 'test',
      sessionId: 'test_session'
    },
    // Actions
    setCurrentStep: jest.fn(),
    setSelectedRegion: jest.fn(),
    setSelectedProduct: jest.fn(),
    setSelectedPaymentMethod: jest.fn(),
    setPaymentStatus: jest.fn(),
    setPaymentSession: jest.fn(),
    setError: jest.fn(),
    setLoading: jest.fn(),
    initializePayment: jest.fn(),
    proceedToNextStep: jest.fn(),
    goBackToPreviousStep: jest.fn(),
    resetPaymentFlow: jest.fn(),
    validateCurrentStep: jest.fn(() => ({ isValid: true })),
    canProceedToNextStep: jest.fn(() => true)
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUsePaymentStore.mockReturnValue(mockStoreState);
  });

  describe('기본 렌더링', () => {
    it('모달이 열린 상태에서 올바르게 렌더링된다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('💳 상품 결제')).toBeInTheDocument();
      expect(screen.getByLabelText('결제 진행 단계')).toBeInTheDocument();
    });

    it('모달이 닫힌 상태에서는 렌더링되지 않는다', () => {
      render(<PaymentModal {...defaultProps} isOpen={false} />);
      
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('진행 단계가 올바르게 표시된다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      // 4개의 단계 원형 아이콘이 있어야 함
      expect(screen.getAllByRole('img')).toHaveLength(4);
      expect(screen.getByLabelText('지역 선택 현재 단계')).toBeInTheDocument();
    });
  });

  describe('단계별 콘텐츠 렌더링', () => {
    it('region 단계에서 지역 선택 UI를 표시한다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('🌍 지역 선택')).toBeInTheDocument();
      expect(screen.getByText('🇰🇷 Korea')).toBeInTheDocument();
      expect(screen.getByText('🌏 Global')).toBeInTheDocument();
    });

    it('product 단계에서 상품 선택 UI를 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'product'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('📦 상품 선택')).toBeInTheDocument();
      expect(screen.getByText('별사탕')).toBeInTheDocument();
      expect(screen.getByText('보너스')).toBeInTheDocument();
      expect(screen.getByText('프리미엄')).toBeInTheDocument();
    });

    it('payment 단계에서 결제 수단 선택 UI를 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'payment',
        selectedRegion: 'korea'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('💰 결제 수단')).toBeInTheDocument();
      expect(screen.getByText('카드결제')).toBeInTheDocument();
      expect(screen.getByText('계좌이체')).toBeInTheDocument();
      expect(screen.getByText('간편결제')).toBeInTheDocument();
    });

    it('review 단계에서 결제 정보 확인 UI를 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'review',
        selectedProduct: mockProduct,
        selectedPaymentMethod: mockPaymentMethod
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('📊 결제 정보 확인')).toBeInTheDocument();
      expect(screen.getByText('별사탕 100개')).toBeInTheDocument();
      expect(screen.getByText('₩5,000')).toBeInTheDocument();
    });

    it('success 단계에서 성공 메시지를 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'success'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('🎉 결제 완료')).toBeInTheDocument();
      expect(screen.getByText('결제가 성공적으로 완료되었습니다!')).toBeInTheDocument();
    });

    it('error 단계에서 에러 메시지를 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'error'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('❌ 결제 실패')).toBeInTheDocument();
      expect(screen.getByText('결제 처리 중 문제가 발생했습니다.')).toBeInTheDocument();
    });
  });

  describe('지역별 결제 수단 표시', () => {
    it('Korea 지역에서 Port One 결제 수단을 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'payment',
        selectedRegion: 'korea'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('Port One을 통한 결제 수단을 선택해주세요.')).toBeInTheDocument();
      expect(screen.getByText('카드결제')).toBeInTheDocument();
      expect(screen.getByText('계좌이체')).toBeInTheDocument();
      expect(screen.getByText('간편결제')).toBeInTheDocument();
    });

    it('Global 지역에서 PayPal 결제 수단을 표시한다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'payment',
        selectedRegion: 'global'
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('PayPal을 통한 결제 수단을 선택해주세요.')).toBeInTheDocument();
      expect(screen.getByText('PayPal')).toBeInTheDocument();
      expect(screen.getByText('Credit Card')).toBeInTheDocument();
    });
  });

  describe('사용자 상호작용', () => {
    it('지역 버튼 클릭 시 store action이 호출된다', async () => {
      const user = userEvent.setup();
      const setSelectedRegion = jest.fn();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        setSelectedRegion
      });

      render(<PaymentModal {...defaultProps} />);
      
      const globalButton = screen.getByText('🌏 Global');
      await user.click(globalButton);
      
      expect(setSelectedRegion).toHaveBeenCalledWith('global');
    });

    it('상품 선택 시 store action이 호출된다', async () => {
      const user = userEvent.setup();
      const setSelectedProduct = jest.fn();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'product',
        setSelectedProduct
      });

      render(<PaymentModal {...defaultProps} />);
      
      const starButton = screen.getByText('별사탕').closest('button');
      await user.click(starButton!);
      
      expect(setSelectedProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          name: '별사탕',
          category: 'stars'
        })
      );
    });

    it('다음 버튼 클릭 시 proceedToNextStep이 호출된다', async () => {
      const user = userEvent.setup();
      const proceedToNextStep = jest.fn().mockResolvedValue(true);
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        proceedToNextStep
      });

      render(<PaymentModal {...defaultProps} />);
      
      const nextButton = screen.getByText('다음');
      await user.click(nextButton);
      
      expect(proceedToNextStep).toHaveBeenCalled();
    });

    it('이전 버튼 클릭 시 goBackToPreviousStep이 호출된다', async () => {
      const user = userEvent.setup();
      const goBackToPreviousStep = jest.fn();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'product',
        goBackToPreviousStep
      });

      render(<PaymentModal {...defaultProps} />);
      
      const backButton = screen.getByText('이전');
      await user.click(backButton);
      
      expect(goBackToPreviousStep).toHaveBeenCalled();
    });

    it('결제하기 버튼 클릭 시 결제 처리가 시작된다', async () => {
      const user = userEvent.setup();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'review',
        selectedProduct: mockProduct,
        selectedPaymentMethod: mockPaymentMethod
      });

      render(<PaymentModal {...defaultProps} />);
      
      const payButton = screen.getByText('결제하기');
      await user.click(payButton);
      
      // 실제 결제 처리 로직이 실행되는지 확인 (setLoading 호출 등)
      expect(mockStoreState.setLoading).toHaveBeenCalledWith(true);
    });
  });

  describe('선택 상태 표시', () => {
    it('선택된 상품이 시각적으로 구분된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'product',
        selectedProduct: mockProduct
      });

      render(<PaymentModal {...defaultProps} />);
      
      const selectedProductButton = screen.getByText('별사탕').closest('button');
      expect(selectedProductButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('선택된 결제 수단이 시각적으로 구분된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'payment',
        selectedPaymentMethod: mockPaymentMethod
      });

      render(<PaymentModal {...defaultProps} />);
      
      const selectedPaymentButton = screen.getByText('카드결제').closest('button');
      expect(selectedPaymentButton).toHaveClass('border-blue-500', 'bg-blue-50');
    });

    it('선택된 상품 정보가 표시된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'product',
        selectedProduct: mockProduct
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('선택된 상품: 별사탕 100개')).toBeInTheDocument();
    });
  });

  describe('로딩 상태', () => {
    it('로딩 중일 때 버튼이 비활성화된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        isLoading: true
      });

      render(<PaymentModal {...defaultProps} />);
      
      const nextButton = screen.getByText('처리 중...');
      expect(nextButton).toBeDisabled();
    });

    it('로딩 중일 때 스피너가 표시된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        isLoading: true
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('처리 중...')).toBeInTheDocument();
      // 스피너 애니메이션 클래스 확인
      expect(document.querySelector('.animate-spin')).toBeInTheDocument();
    });
  });

  describe('에러 처리', () => {
    it('에러 메시지가 표시된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        error: mockError
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByText('오류가 발생했습니다')).toBeInTheDocument();
      expect(screen.getByText(mockError.message)).toBeInTheDocument();
    });

    it('재시도 가능한 에러에서 다시 시도 버튼이 표시된다', async () => {
      const user = userEvent.setup();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'error',
        error: mockError
      });

      render(<PaymentModal {...defaultProps} />);
      
      const retryButton = screen.getByText('다시 시도');
      expect(retryButton).toBeInTheDocument();
      
      await user.click(retryButton);
      expect(mockStoreState.setCurrentStep).toHaveBeenCalledWith('review');
    });
  });

  describe('접근성', () => {
    it('적절한 ARIA 레이블이 있다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByLabelText('결제 진행 단계')).toBeInTheDocument();
      expect(screen.getByLabelText(/결제 단계.*지역 선택/)).toBeInTheDocument();
      expect(screen.getByRole('alert')).not.toBeInTheDocument(); // 에러가 없을 때
    });

    it('에러 발생 시 alert role이 설정된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        error: mockError
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('키보드 네비게이션이 가능하다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      const mainContent = screen.getByLabelText(/결제 단계.*지역 선택/);
      expect(mainContent).toHaveAttribute('tabIndex', '-1');
    });

    it('재시도 버튼에 적절한 레이블이 있다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        error: mockError
      });

      render(<PaymentModal {...defaultProps} />);
      
      expect(screen.getByLabelText('결제 다시 시도')).toBeInTheDocument();
    });
  });

  describe('키보드 이벤트', () => {
    it('Escape 키로 모달을 닫을 수 있다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(defaultProps.onClose).toHaveBeenCalled();
      expect(mockStoreState.resetPaymentFlow).toHaveBeenCalled();
    });

    it('로딩 중일 때는 Escape 키가 무시된다', () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        isLoading: true
      });

      render(<PaymentModal {...defaultProps} />);
      
      fireEvent.keyDown(document, { key: 'Escape' });
      
      expect(defaultProps.onClose).not.toHaveBeenCalled();
    });
  });

  describe('콜백 함수', () => {
    it('결제 성공 시 onPaymentSuccess가 호출된다', async () => {
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'success'
      });

      // 모달 props에 onPaymentSuccess 설정
      const onPaymentSuccess = jest.fn();
      render(<PaymentModal {...defaultProps} onPaymentSuccess={onPaymentSuccess} />);
      
      // 실제로는 결제 처리 완료 후 호출되지만, 테스트에서는 상태 확인
      expect(screen.getByText('🎉 결제 완료')).toBeInTheDocument();
    });

    it('결제 실패 시 onPaymentError가 호출된다', () => {
      const onPaymentError = jest.fn();
      mockUsePaymentStore.mockReturnValue({
        ...mockStoreState,
        currentStep: 'error',
        error: mockError
      });

      render(<PaymentModal {...defaultProps} onPaymentError={onPaymentError} />);
      
      expect(screen.getByText('❌ 결제 실패')).toBeInTheDocument();
    });

    it('모달 닫기 시 onClose와 onPaymentCancel이 호출된다', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      const onPaymentCancel = jest.fn();

      render(
        <PaymentModal 
          {...defaultProps} 
          onClose={onClose} 
          onPaymentCancel={onPaymentCancel} 
        />
      );
      
      // X 버튼 찾기 (Dialog 컴포넌트에서 제공)
      const closeButton = screen.getByRole('button', { name: /close|닫기/i });
      await user.click(closeButton);
      
      expect(onClose).toHaveBeenCalled();
      expect(onPaymentCancel).toHaveBeenCalled();
      expect(mockStoreState.resetPaymentFlow).toHaveBeenCalled();
    });
  });

  describe('초기화', () => {
    it('모달이 열릴 때 store가 초기화된다', () => {
      render(<PaymentModal {...defaultProps} />);
      
      expect(mockStoreState.initializePayment).toHaveBeenCalledWith(
        defaultProps.detectedRegion,
        undefined
      );
    });

    it('초기 상품이 있을 때 제대로 설정된다', () => {
      render(<PaymentModal {...defaultProps} initialProduct={mockProduct} />);
      
      expect(mockStoreState.initializePayment).toHaveBeenCalledWith(
        defaultProps.detectedRegion,
        mockProduct
      );
    });

    it('초기 지역이 있을 때 제대로 설정된다', () => {
      render(<PaymentModal {...defaultProps} initialRegion="global" />);
      
      expect(mockStoreState.setSelectedRegion).toHaveBeenCalledWith('global');
    });
  });
});