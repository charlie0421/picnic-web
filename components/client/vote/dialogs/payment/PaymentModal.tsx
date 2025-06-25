'use client';

import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import type { PaymentModalProps, PaymentStep, Region } from './types';

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
}) => {
  // ========================================================================================
  // State Management (임시 구현, 추후 hooks로 이동)
  // ========================================================================================
  
  const [currentStep, setCurrentStep] = React.useState<PaymentStep>('region');
  const [selectedRegion, setSelectedRegion] = React.useState<Region>(
    initialRegion || detectedRegion
  );
  const [isLoading, setIsLoading] = React.useState(false);

  // ========================================================================================
  // Event Handlers
  // ========================================================================================
  
  const handleClose = React.useCallback(() => {
    if (onPaymentCancel) {
      onPaymentCancel();
    }
    onClose();
  }, [onClose, onPaymentCancel]);

  const handleRegionChange = React.useCallback((region: Region) => {
    setSelectedRegion(region);
    if (debug) {
      console.log('[PaymentModal] Region changed:', region);
    }
  }, [debug]);

  const handleNextStep = React.useCallback(() => {
    const stepOrder: PaymentStep[] = ['region', 'product', 'payment', 'review', 'processing'];
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  }, [currentStep]);

  const handlePreviousStep = React.useCallback(() => {
    const stepOrder: PaymentStep[] = ['region', 'product', 'payment', 'review', 'processing'];
    const currentIndex = stepOrder.indexOf(currentStep);
    
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  }, [currentStep]);

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
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">📦 상품 선택</h3>
              <p className="text-gray-600 text-sm mb-4">
                구매하실 상품을 선택해주세요.
              </p>
              
              <div className="grid grid-cols-3 gap-3">
                {/* 임시 상품 목록 */}
                <div className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer">
                  <div className="text-2xl mb-2">⭐</div>
                  <div className="font-semibold">별사탕</div>
                  <div className="text-sm text-gray-600">100개</div>
                  <div className="text-lg font-bold text-blue-600">₩5,000</div>
                </div>
                
                <div className="p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 cursor-pointer">
                  <div className="text-2xl mb-2">🎁</div>
                  <div className="font-semibold">보너스</div>
                  <div className="text-sm text-gray-600">50개</div>
                  <div className="text-lg font-bold text-blue-600">₩3,000</div>
                </div>
                
                <div className="p-3 border-2 border-blue-500 bg-blue-50 rounded-lg cursor-pointer">
                  <div className="text-2xl mb-2">💎</div>
                  <div className="font-semibold">프리미엄</div>
                  <div className="text-sm text-gray-600">20개</div>
                  <div className="text-lg font-bold text-blue-600">₩10,000</div>
                  <div className="text-xs text-blue-600 mt-1">인기</div>
                </div>
              </div>
            </div>
          </div>
        );
        
      case 'payment':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">💰 결제 수단</h3>
              <p className="text-gray-600 text-sm mb-4">
                {selectedRegion === 'korea' ? 'Port One을 통한 결제 수단을 선택해주세요.' : 'PayPal을 통한 결제 수단을 선택해주세요.'}
              </p>
              
              <div className="space-y-2">
                {selectedRegion === 'korea' ? (
                  <>
                    <button className="w-full p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 text-left">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">💳</div>
                        <div>
                          <div className="font-semibold">카드결제</div>
                          <div className="text-sm text-gray-600">신용/체크카드</div>
                        </div>
                      </div>
                    </button>
                    
                    <button className="w-full p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 text-left">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">🏦</div>
                        <div>
                          <div className="font-semibold">계좌이체</div>
                          <div className="text-sm text-gray-600">실시간 계좌이체</div>
                        </div>
                      </div>
                    </button>
                    
                    <button className="w-full p-3 border-2 border-blue-500 bg-blue-50 rounded-lg text-left">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">📱</div>
                        <div>
                          <div className="font-semibold">간편결제</div>
                          <div className="text-sm text-gray-600">카카오페이, 토스페이 등</div>
                        </div>
                      </div>
                    </button>
                  </>
                ) : (
                  <>
                    <button className="w-full p-3 border-2 border-blue-500 bg-blue-50 rounded-lg text-left">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">💰</div>
                        <div>
                          <div className="font-semibold">PayPal</div>
                          <div className="text-sm text-gray-600">PayPal 계정 또는 카드결제</div>
                        </div>
                      </div>
                    </button>
                    
                    <button className="w-full p-3 border-2 border-gray-200 rounded-lg hover:border-blue-300 text-left">
                      <div className="flex items-center gap-3">
                        <div className="text-xl">💳</div>
                        <div>
                          <div className="font-semibold">Credit Card</div>
                          <div className="text-sm text-gray-600">Visa, MasterCard, American Express</div>
                        </div>
                      </div>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
        
      case 'review':
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">📊 결제 정보 확인</h3>
              <p className="text-gray-600 text-sm mb-4">
                결제 정보를 확인해주세요.
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span>상품</span>
                  <span>프리미엄 20개</span>
                </div>
                <div className="flex justify-between">
                  <span>가격</span>
                  <span>₩10,000</span>
                </div>
                <div className="flex justify-between">
                  <span>결제수수료</span>
                  <span>₩150</span>
                </div>
                <hr />
                <div className="flex justify-between font-bold text-lg">
                  <span>총 결제금액</span>
                  <span>₩10,150</span>
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
              onClick={currentStep === 'review' ? () => setCurrentStep('processing') : handleNextStep}
              disabled={isLoading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {currentStep === 'review' ? '결제하기' : '다음'}
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
        <div className="flex items-center justify-center space-x-2 py-2">
          {['region', 'product', 'payment', 'review'].map((step, index) => {
            const stepOrder: PaymentStep[] = ['region', 'product', 'payment', 'review'];
            const currentIndex = stepOrder.indexOf(currentStep);
            const isActive = step === currentStep;
            const isCompleted = index < currentIndex;
            
            return (
              <div key={step} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {isCompleted ? '✓' : index + 1}
                </div>
                {index < stepOrder.length - 1 && (
                  <div
                    className={`w-12 h-1 mx-2 ${
                      isCompleted ? 'bg-green-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 현재 단계 내용 */}
        <div className="min-h-[300px]">
          {renderStepContent()}
        </div>

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