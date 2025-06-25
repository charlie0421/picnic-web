import { create } from 'zustand';
import type { 
  PaymentStep, 
  Region, 
  PaymentProvider, 
  ProductType, 
  PaymentMethod,
  PaymentStatus,
  PaymentSession,
  PaymentError,
  PaymentModalState 
} from '@/components/client/vote/dialogs/payment/types';

/**
 * 결제 모달 상태 관리 스토어
 */
interface PaymentStoreState extends PaymentModalState {
  // Actions
  setCurrentStep: (step: PaymentStep) => void;
  setSelectedRegion: (region: Region) => void;
  setSelectedProduct: (product: ProductType | undefined) => void;
  setSelectedPaymentMethod: (method: PaymentMethod | undefined) => void;
  setPaymentStatus: (status: PaymentStatus) => void;
  setPaymentSession: (session: PaymentSession | undefined) => void;
  setError: (error: PaymentError | undefined) => void;
  setLoading: (loading: boolean) => void;
  
  // Complex Actions
  initializePayment: (detectedRegion: Region, initialProduct?: ProductType) => void;
  proceedToNextStep: () => Promise<boolean>;
  goBackToPreviousStep: () => void;
  resetPaymentFlow: () => void;
  
  // Validation
  canProceedToNextStep: () => boolean;
  validateCurrentStep: () => { isValid: boolean; error?: string };
}

/**
 * 초기 상태
 */
const initialState: PaymentModalState = {
  currentStep: 'region',
  selectedRegion: 'korea',
  detectedRegion: 'korea',
  selectedProduct: undefined,
  selectedPaymentMethod: undefined,
  paymentStatus: 'idle',
  paymentSession: undefined,
  error: undefined,
  isLoading: false,
  stepHistory: ['region'],
  metadata: {
    startedAt: Date.now(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : '',
    sessionId: Math.random().toString(36).substring(2, 15)
  }
};

/**
 * 결제 스토어
 */
export const usePaymentStore = create<PaymentStoreState>((set, get) => ({
  ...initialState,
  
  // ========================================================================================
  // Basic Setters
  // ========================================================================================
  
  setCurrentStep: (step: PaymentStep) => set((state) => ({
    currentStep: step,
    stepHistory: [...state.stepHistory, step]
  })),
  
  setSelectedRegion: (region: Region) => set({
    selectedRegion: region
  }),
  
  setSelectedProduct: (product: ProductType | undefined) => set({
    selectedProduct: product
  }),
  
  setSelectedPaymentMethod: (method: PaymentMethod | undefined) => set({
    selectedPaymentMethod: method
  }),
  
  setPaymentStatus: (status: PaymentStatus) => set({
    paymentStatus: status
  }),
  
  setPaymentSession: (session: PaymentSession | undefined) => set({
    paymentSession: session
  }),
  
  setError: (error: PaymentError | undefined) => set({
    error,
    paymentStatus: error ? 'failed' : get().paymentStatus
  }),
  
  setLoading: (loading: boolean) => set({
    isLoading: loading
  }),
  
  // ========================================================================================
  // Complex Actions
  // ========================================================================================
  
  initializePayment: (detectedRegion: Region, initialProduct?: ProductType) => set({
    detectedRegion,
    selectedRegion: detectedRegion,
    selectedProduct: initialProduct,
    currentStep: initialProduct ? 'payment' : 'region',
    stepHistory: [initialProduct ? 'payment' : 'region'],
    paymentStatus: 'idle',
    error: undefined,
    isLoading: false,
    metadata: {
      ...initialState.metadata,
      startedAt: Date.now(),
      sessionId: Math.random().toString(36).substring(2, 15)
    }
  }),
  
  proceedToNextStep: async (): Promise<boolean> => {
    const state = get();
    const validation = state.validateCurrentStep();
    
    if (!validation.isValid) {
      set({ 
        error: { 
          code: 'VALIDATION_ERROR', 
          message: validation.error || 'Invalid step data',
          details: { step: state.currentStep },
          recoverable: true,
          retryable: true,
          timestamp: new Date()
        }
      });
      return false;
    }
    
    const nextStep = getNextStep(state.currentStep);
    if (nextStep) {
      set(state => ({
        currentStep: nextStep,
        stepHistory: [...state.stepHistory, nextStep],
        error: undefined
      }));
      return true;
    }
    
    return false;
  },
  
  goBackToPreviousStep: () => set((state) => {
    const history = state.stepHistory;
    if (history.length > 1) {
      const previousStep = history[history.length - 2];
      return {
        currentStep: previousStep,
        stepHistory: history.slice(0, -1),
        error: undefined
      };
    }
    return state;
  }),
  
  resetPaymentFlow: () => set(initialState),
  
  // ========================================================================================
  // Validation
  // ========================================================================================
  
  canProceedToNextStep: (): boolean => {
    const validation = get().validateCurrentStep();
    return validation.isValid;
  },
  
  validateCurrentStep: (): { isValid: boolean; error?: string } => {
    const state = get();
    
    switch (state.currentStep) {
      case 'region':
        return { isValid: !!state.selectedRegion };
        
      case 'product':
        return { 
          isValid: !!state.selectedProduct,
          error: !state.selectedProduct ? '상품을 선택해주세요.' : undefined
        };
        
      case 'payment':
        return { 
          isValid: !!state.selectedPaymentMethod && !!state.selectedProduct,
          error: !state.selectedPaymentMethod ? '결제 수단을 선택해주세요.' : undefined
        };
        
      case 'review':
        return { 
          isValid: !!(state.selectedProduct && state.selectedPaymentMethod && state.selectedRegion),
          error: '필수 정보가 누락되었습니다.'
        };
        
      case 'processing':
      case 'success':
      case 'error':
        return { isValid: true };
        
      default:
        return { isValid: false, error: '알 수 없는 단계입니다.' };
    }
  }
}));

// ========================================================================================
// Helper Functions
// ========================================================================================

/**
 * 다음 단계 결정 로직
 */
function getNextStep(currentStep: PaymentStep): PaymentStep | null {
  switch (currentStep) {
    case 'region':
      return 'product';
    case 'product':
      return 'payment';
    case 'payment':
      return 'review';
    case 'review':
      return 'processing';
    default:
      return null;
  }
}

/**
 * 지역별 결제 제공업체 반환
 */
export function getPaymentProvider(region: Region): PaymentProvider {
  return region === 'korea' ? 'portone' : 'paypal';
}

/**
 * 사용자 친화적인 단계 이름 반환
 */
export function getStepDisplayName(step: PaymentStep): string {
  const stepNames: Record<PaymentStep, string> = {
    region: '지역 선택',
    product: '상품 선택',
    payment: '결제 수단',
    review: '결제 확인',
    processing: '결제 중',
    success: '결제 완료',
    error: '결제 실패'
  };
  
  return stepNames[step] || step;
}

export default usePaymentStore;