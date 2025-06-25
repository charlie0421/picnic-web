'use client';

import { useEffect, useCallback, useRef } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { usePaymentStore } from '@/stores/paymentStore';
import type { PaymentModalProps, PaymentStep, Region, ProductType, PaymentMethod } from './types';

/**
 * 결제 모달 메인 컴포넌트
 * 기존 Dialog 시스템을 확장하여 결제 플로우를 제공합니다.
 */
export function PaymentModal({
  isOpen,
  onClose,
  detectedRegion = 'korea',
  initialProduct,
  initialRegion,
  onPaymentSuccess,
  onPaymentError,
  onPaymentCancel,
  debug = false,
  theme,
  ...dialogProps
}: PaymentModalProps) {
  // ========================================================================================
  // Zustand Store State & Actions
  // ========================================================================================
  
  const {
    // State
    currentStep,
    selectedRegion,
    selectedProduct,
    selectedPaymentMethod,
    isLoading,
    error,
    paymentStatus,
    
    // Actions
    setSelectedRegion,
    setSelectedProduct,
    setSelectedPaymentMethod,
    setCurrentStep,
    setLoading,
    initializePayment,
    proceedToNextStep,
    goBackToPreviousStep,
    resetPaymentFlow,
    canProceedToNextStep
  } = usePaymentStore();

  // ========================================================================================
  // Accessibility & Focus Management
  // ========================================================================================
  
  const mainContentRef = useRef<HTMLDivElement>(null);
  const errorMessageRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  // 단계별 포커스 관리
  const focusMainContent = useCallback(() => {
    if (mainContentRef.current) {
      mainContentRef.current.focus();
    }
  }, []);

  // 키보드 네비게이션 (이벤트 핸들러 선언 후 정의)

  // 단계 변경 시 포커스 관리
  useEffect(() => {
    if (isOpen && currentStep) {
      setTimeout(() => {
        focusMainContent();
      }, 100); // 애니메이션 완료 후 포커스
    }
  }, [currentStep, isOpen, focusMainContent]);

  // 에러 발생 시 포커스 관리
  useEffect(() => {
    if (error && errorMessageRef.current) {
      errorMessageRef.current.focus();
    }
  }, [error]);

  // ========================================================================================
  // Initialization
  // ========================================================================================
  
  useEffect(() => {
    if (isOpen) {
      // 모달이 열릴 때 store 초기화
      initializePayment(detectedRegion, initialProduct);
      
      // 초기 지역이 있으면 설정
      if (initialRegion) {
        setSelectedRegion(initialRegion);
      }
      
      if (debug) {
        console.log('[PaymentModal] Initialized with:', {
          detectedRegion,
          initialProduct,
          initialRegion
        });
      }
    }
  }, [isOpen, detectedRegion, initialProduct, initialRegion, initializePayment, setSelectedRegion, debug]);

  // ========================================================================================
  // Event Handlers
  // ========================================================================================
  
  const handleClose = useCallback(() => {
    if (onPaymentCancel) {
      onPaymentCancel();
    }
    resetPaymentFlow(); // store 초기화
    onClose();
  }, [onClose, onPaymentCancel, resetPaymentFlow]);

  const handleRegionChange = useCallback((region: Region) => {
    setSelectedRegion(region);
    if (debug) {
      console.log('[PaymentModal] Region changed:', region);
    }
  }, [setSelectedRegion, debug]);

  const handleProductSelect = useCallback((product: ProductType) => {
    setSelectedProduct(product);
    if (debug) {
      console.log('[PaymentModal] Product selected:', product);
    }
  }, [setSelectedProduct, debug]);

  const handlePaymentMethodSelect = useCallback((method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    if (debug) {
      console.log('[PaymentModal] Payment method selected:', method);
    }
  }, [setSelectedPaymentMethod, debug]);

  const handleNextStep = useCallback(async () => {
    const success = await proceedToNextStep();
    if (!success && debug) {
      console.log('[PaymentModal] Cannot proceed to next step');
    }
  }, [proceedToNextStep, debug]);

  const handlePreviousStep = useCallback(() => {
    goBackToPreviousStep();
  }, [goBackToPreviousStep]);

  const handlePaymentProcess = useCallback(async () => {
    setLoading(true);
    try {
      // 여기서 실제 결제 처리 로직 추가 예정
      // 현재는 임시로 성공 처리
      await new Promise(resolve => setTimeout(resolve, 2000));
      setCurrentStep('success');
      
      if (onPaymentSuccess) {
        // 임시 영수증 객체
        const mockReceipt = {
          receiptId: `receipt_${Date.now()}`,
          paymentId: `payment_${Date.now()}`,
          transactionId: `tx_${Date.now()}`,
          status: 'completed' as const,
          completedAt: new Date(),
          product: selectedProduct!,
          paymentMethod: selectedPaymentMethod!,
          priceBreakdown: {
            subtotal: selectedProduct?.price || 0,
            fees: 150,
            fixedFees: 0,
            discount: 0,
            tax: 0,
            total: (selectedProduct?.price || 0) + 150,
            currency: selectedProduct?.currency || 'KRW'
          },
          region: selectedRegion,
          userId: 'temp_user_id'
        };
        onPaymentSuccess(mockReceipt);
      }
    } catch (error) {
      setCurrentStep('error');
      if (onPaymentError) {
        onPaymentError({
          code: 'PAYMENT_FAILED',
          message: '결제 처리 중 오류가 발생했습니다.',
          recoverable: true,
          retryable: true,
          timestamp: new Date()
        });
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProduct, selectedPaymentMethod, selectedRegion, setLoading, setCurrentStep, onPaymentSuccess, onPaymentError]);

  // ========================================================================================
  // Keyboard Navigation (after event handlers are defined)
  // ========================================================================================
  
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        if (!isLoading && currentStep !== 'processing') {
          handleClose();
        }
        break;
      case 'Enter':
        if (event.target === submitButtonRef.current && canProceedToNextStep()) {
          event.preventDefault();
          if (currentStep === 'review') {
            handlePaymentProcess();
          } else {
            handleNextStep();
          }
        }
        break;
    }
  }, [isLoading, currentStep, handleClose, canProceedToNextStep, handlePaymentProcess, handleNextStep]);

  // 키보드 이벤트 리스너 등록
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, handleKeyDown]);

  // ========================================================================================
  // Step Content Rendering
  // ========================================================================================
  
  const renderStepContent = () => {
    switch (currentStep) {
      case 'region':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">🌍 지역 선택</h3>
              <p className="text-gray-600 text-sm mb-4">
                결제 지역을 선택해주세요. {detectedRegion === 'korea' ? '한국' : '해외'} 지역이 자동으로 감지되었습니다.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => handleRegionChange('korea')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    selectedRegion === 'korea'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🇰🇷</div>
                  <div className="font-semibold">Korea</div>
                  <div className="text-xs text-gray-500">Port One 결제</div>
                </button>
                
                <button
                  onClick={() => handleRegionChange('global')}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors ${
                    selectedRegion === 'global'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🌏</div>
                  <div className="font-semibold">Global</div>
                  <div className="text-xs text-gray-500">PayPal 결제</div>
                </button>
              </div>
            </div>
          </div>
        );
        
      case 'product':
        // 임시 상품 데이터 (추후 API로 대체)
        const mockProducts: ProductType[] = [
          {
            id: 'stars_100',
            name: '별사탕',
            description: '투표에 사용할 수 있는 별사탕',
            quantity: 100,
            price: 5000,
            currency: 'KRW',
            icon: '⭐',
            category: 'stars'
          },
          {
            id: 'bonus_50',
            name: '보너스',
            description: '특별한 혜택을 받을 수 있는 보너스',
            quantity: 50,
            price: 3000,
            currency: 'KRW',
            icon: '🎁',
            category: 'bonus'
          },
          {
            id: 'premium_20',
            name: '프리미엄',
            description: '프리미엄 기능을 이용할 수 있는 패키지',
            quantity: 20,
            price: 10000,
            currency: 'KRW',
            icon: '💎',
            category: 'premium',
            popular: true
          }
        ];

        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">📦 상품 선택</h3>
              <p className="text-gray-600 text-sm mb-4">
                구매하실 상품을 선택해주세요.
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {mockProducts.map((product) => {
                  const isSelected = selectedProduct?.id === product.id;
                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product)}
                      className={`p-3 border-2 rounded-lg transition-colors text-left ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-2xl mb-2">{product.icon}</div>
                      <div className="font-semibold">{product.name}</div>
                      <div className="text-sm text-gray-600">{product.quantity}개</div>
                      <div className="text-lg font-bold text-blue-600">
                        {product.currency === 'KRW' ? '₩' : '$'}{product.price.toLocaleString()}
                      </div>
                      {product.popular && (
                        <div className="text-xs text-blue-600 mt-1">인기</div>
                      )}
                    </button>
                  );
                })}
              </div>
              
              {/* 선택된 상품 정보 표시 */}
              {selectedProduct && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-800">
                    선택된 상품: <strong>{selectedProduct.name} {selectedProduct.quantity}개</strong>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    {selectedProduct.description}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
        
      case 'payment':
        // 임시 결제 수단 데이터 (추후 API로 대체)
        const mockPaymentMethods: PaymentMethod[] = selectedRegion === 'korea' ? [
          {
            id: 'card_kr',
            name: '카드결제',
            icon: '💳',
            provider: 'portone',
            fees: 2.9,
            supportedCurrencies: ['KRW'],
            enabled: true
          },
          {
            id: 'transfer_kr',
            name: '계좌이체',
            icon: '🏦',
            provider: 'portone',
            fees: 1.5,
            supportedCurrencies: ['KRW'],
            enabled: true
          },
          {
            id: 'simple_kr',
            name: '간편결제',
            icon: '📱',
            provider: 'portone',
            fees: 2.5,
            supportedCurrencies: ['KRW'],
            enabled: true
          }
        ] : [
          {
            id: 'paypal_global',
            name: 'PayPal',
            icon: '💰',
            provider: 'paypal',
            fees: 3.4,
            supportedCurrencies: ['USD'],
            enabled: true
          },
          {
            id: 'card_global',
            name: 'Credit Card',
            icon: '💳',
            provider: 'paypal',
            fees: 3.9,
            supportedCurrencies: ['USD'],
            enabled: true
          }
        ];

        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">💰 결제 수단</h3>
              <p className="text-gray-600 text-sm mb-4">
                {selectedRegion === 'korea' ? 'Port One을 통한 결제 수단을 선택해주세요.' : 'PayPal을 통한 결제 수단을 선택해주세요.'}
              </p>
              
              <div className="space-y-2">
                {mockPaymentMethods.map((method) => {
                  const isSelected = selectedPaymentMethod?.id === method.id;
                  return (
                    <button
                      key={method.id}
                      onClick={() => handlePaymentMethodSelect(method)}
                      className={`w-full p-3 border-2 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-xl">{method.icon}</div>
                          <div>
                            <div className="font-semibold">{method.name}</div>
                            <div className="text-sm text-gray-600">
                              {method.id === 'card_kr' && '신용/체크카드'}
                              {method.id === 'transfer_kr' && '실시간 계좌이체'}
                              {method.id === 'simple_kr' && '카카오페이, 토스페이 등'}
                              {method.id === 'paypal_global' && 'PayPal 계정 또는 카드결제'}
                              {method.id === 'card_global' && 'Visa, MasterCard, American Express'}
                            </div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500">
                          수수료 {method.fees}%
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {/* 선택된 결제 수단 정보 표시 */}
              {selectedPaymentMethod && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm text-blue-800">
                    선택된 결제 수단: <strong>{selectedPaymentMethod.name}</strong>
                  </div>
                  <div className="text-xs text-blue-600 mt-1">
                    수수료: {selectedPaymentMethod.fees}% | 제공업체: {selectedPaymentMethod.provider}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
        
      case 'review':
        // 가격 계산
        const productPrice = selectedProduct?.price || 0;
        const feeRate = selectedPaymentMethod?.fees || 0;
        const fees = Math.round(productPrice * (feeRate / 100));
        const totalPrice = productPrice + fees;
        const currency = selectedProduct?.currency || 'KRW';
        const currencySymbol = currency === 'KRW' ? '₩' : '$';

        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">📊 결제 정보 확인</h3>
              <p className="text-gray-600 text-sm mb-4">
                결제 정보를 확인해주세요.
              </p>
              
              {/* 선택 정보 요약 */}
              <div className="bg-blue-50 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">지역:</span>
                    <span className="ml-2 font-semibold">
                      {selectedRegion === 'korea' ? '🇰🇷 Korea' : '🌏 Global'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">결제업체:</span>
                    <span className="ml-2 font-semibold capitalize">
                      {selectedPaymentMethod?.provider}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* 가격 분석 */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span>상품</span>
                  <span>
                    {selectedProduct?.name} {selectedProduct?.quantity}개
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>가격</span>
                  <span>{currencySymbol}{productPrice.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>결제수수료 ({feeRate}%)</span>
                  <span>{currencySymbol}{fees.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>결제 수단</span>
                  <span>{selectedPaymentMethod?.name}</span>
                </div>
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>총 결제금액</span>
                  <span className="text-blue-600">
                    {currencySymbol}{totalPrice.toLocaleString()}
                  </span>
                </div>
              </div>
              
              {/* 주의사항 */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <div className="text-sm text-yellow-800">
                  <strong>안내사항:</strong>
                  <ul className="mt-1 ml-4 list-disc space-y-1">
                    <li>결제 후 즉시 계정에 반영됩니다.</li>
                    <li>환불은 구매 후 7일 이내에만 가능합니다.</li>
                    <li>결제 오류 시 고객센터로 문의해주세요.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'processing':
        return (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">결제 진행 중...</h3>
            <p className="text-gray-600">잠시만 기다려주세요.</p>
          </div>
        );
        
      case 'success':
        return (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">✅</div>
            <h3 className="text-lg font-semibold mb-2">결제가 완료되었습니다!</h3>
            <p className="text-gray-600">구매하신 상품이 계정에 추가되었습니다.</p>
          </div>
        );
        
      case 'error':
        return (
          <div className="text-center py-8">
            <div className="text-6xl mb-4">❌</div>
            <h3 className="text-lg font-semibold mb-2">결제에 실패했습니다</h3>
            <p className="text-gray-600">다시 시도해주세요.</p>
          </div>
        );
        
      default:
        return null;
    }
  };

  // ========================================================================================
  // Footer Actions Rendering
  // ========================================================================================
  
  const renderFooterActions = () => {
    const isFirstStep = currentStep === 'region';
    const isLastStep = ['processing', 'success', 'error'].includes(currentStep);
    const isProcessing = currentStep === 'processing';
    
    if (currentStep === 'success') {
      return (
        <div className="flex justify-end">
          <button
            onClick={handleClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            확인
          </button>
        </div>
      );
    }
    
    if (currentStep === 'error') {
      return (
        <div className="flex justify-between">
          <button
            onClick={handleClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          <button
            onClick={() => setCurrentStep('region')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            다시 시도
          </button>
        </div>
      );
    }
    
    if (isProcessing) {
      return null; // 처리 중에는 버튼 숨김
    }
    
    return (
      <div className="flex justify-between">
        <div>
          {!isFirstStep && (
            <button
              onClick={handlePreviousStep}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              이전
            </button>
          )}
        </div>
        
        <div className="flex gap-2">
          <button
            onClick={handleClose}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            취소
          </button>
          
          {!isLastStep && (
            <button
              onClick={currentStep === 'review' ? handlePaymentProcess : handleNextStep}
              disabled={isLoading || !canProceedToNextStep()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  처리 중...
                </div>
              ) : (
                currentStep === 'review' ? '결제하기' : '다음'
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  // ========================================================================================
  // Render
  // ========================================================================================
  
  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title="💳 상품 결제"
      size="lg"
      closeOnOverlayClick={false} // 실수로 모달이 닫히는 것을 방지
      {...dialogProps}
    >
      <div className="space-y-6">
        {/* 진행 단계 표시 */}
        <nav 
          aria-label="결제 진행 단계"
          className="flex items-center justify-center space-x-2 py-2"
        >
          {['region', 'product', 'payment', 'review'].map((step, index) => {
            const stepOrder: PaymentStep[] = ['region', 'product', 'payment', 'review'];
            const currentIndex = stepOrder.indexOf(currentStep);
            const isActive = step === currentStep;
            const isCompleted = index < currentIndex;
            const stepName = ['지역 선택', '상품 선택', '결제 수단', '결제 확인'][index];
            
            return (
              <div key={step} className="flex items-center">
                <div
                  role="img"
                  aria-label={`${stepName} ${isCompleted ? '완료됨' : isActive ? '현재 단계' : '대기 중'}`}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  <span aria-hidden="true">
                    {isCompleted ? '✓' : index + 1}
                  </span>
                </div>
                {index < stepOrder.length - 1 && (
                  <div
                    aria-hidden="true"
                    className={`w-12 h-1 mx-2 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </nav>

        {/* 에러 표시 */}
        {error && (
          <div 
            ref={errorMessageRef}
            role="alert"
            aria-live="polite"
            aria-atomic="true"
            tabIndex={-1}
            className="bg-red-50 border border-red-200 rounded-lg p-4"
          >
            <div className="flex items-start gap-3">
              <div className="text-red-500 text-xl" aria-hidden="true">⚠️</div>
              <div>
                <div className="font-semibold text-red-800">오류가 발생했습니다</div>
                <div className="text-sm text-red-700 mt-1">{error.message}</div>
                {error.retryable && (
                  <button
                    onClick={() => {
                      // 에러 초기화하고 재시도
                      if (currentStep === 'error') {
                        setCurrentStep('review');
                      }
                    }}
                    className="mt-2 text-sm text-red-600 underline hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
                    aria-label="결제 다시 시도"
                  >
                    다시 시도
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 현재 단계 내용 */}
        <main 
          ref={mainContentRef}
          tabIndex={-1}
          aria-label={`결제 단계 ${currentStep === 'region' ? '1: 지역 선택' : 
                      currentStep === 'product' ? '2: 상품 선택' : 
                      currentStep === 'payment' ? '3: 결제 수단 선택' : 
                      currentStep === 'review' ? '4: 결제 정보 확인' : 
                      currentStep === 'processing' ? '결제 처리 중' :
                      currentStep === 'success' ? '결제 완료' : '결제 실패'}`}
          className="min-h-[300px] focus:outline-none"
        >
          {renderStepContent()}
        </main>

        {/* 하단 액션 버튼들 */}
        <div className="border-t pt-4">
          {renderFooterActions()}
        </div>
      </div>
      
      {/* 디버그 정보 */}
      {debug && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
          <div>Current Step: {currentStep}</div>
          <div>Selected Region: {selectedRegion}</div>
          <div>Detected Region: {detectedRegion}</div>
        </div>
      )}
    </Dialog>
  );
};