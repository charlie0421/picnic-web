// ========================================================================================
// Payment Modal System Exports
// ========================================================================================

// Types
export type {
  // 기본 타입
  Region,
  Currency,
  PaymentProvider,
  ProductCategory,
  PaymentStep,
  PaymentStatus,
  
  // 상품 관련
  ProductType,
  
  // 결제 수단 관련
  PaymentMethod,
  
  // 가격 관련
  PriceBreakdown,
  
  // 세션 및 영수증
  PaymentSession,
  PaymentReceipt,
  
  // 에러
  PaymentError,
  
  // 컴포넌트 Props
  PaymentModalProps,
  PaymentRateTableProps,
  RegionSelectorProps,
  ProductSelectorProps,
  PaymentMethodSelectorProps,
  PriceTableProps,
  PaymentActionsProps,
  
  // 상태 관리
  PaymentModalState,
  
  // 훅 타입
  UsePaymentModalReturn,
  UseRegionDetectionReturn,
  UsePaymentFlowReturn,
  
  // 테마
  PaymentModalTheme,
  
  // API 응답 타입
  ProductsResponse,
  PaymentMethodsResponse,
  PriceCalculationResponse,
  PaymentInitResponse,
  PaymentCompleteResponse,
} from './types';

// Components
export { PaymentModal } from './PaymentModal';
export { PaymentRateTable } from './PaymentRateTable';
// export { RegionSelector } from './RegionSelector';
// export { ProductSelector } from './ProductSelector';
// export { PaymentMethodSelector } from './PaymentMethodSelector';
// export { PriceTable } from './PriceTable';
// export { PaymentActions } from './PaymentActions';

// Hooks (아직 구현되지 않았지만 향후 export 예정)
// export { usePaymentModal } from './hooks/usePaymentModal';
// export { useRegionDetection } from './hooks/useRegionDetection';
// export { usePaymentFlow } from './hooks/usePaymentFlow';

// Constants and Utilities (향후 추가 예정)
// export { PAYMENT_STEPS, DEFAULT_THEME } from './constants';
// export { formatPrice, calculateFees, validatePaymentMethod } from './utils';