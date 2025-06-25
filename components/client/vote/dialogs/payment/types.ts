import type { BaseDialogProps } from '@/components/ui/Dialog/types';

// ========================================================================================
// 기본 타입 정의
// ========================================================================================

/**
 * 지역 타입 - IP 기반 자동 감지 및 수동 선택을 위한 타입
 */
export type Region = 'korea' | 'global';

/**
 * 통화 타입
 */
export type Currency = 'KRW' | 'USD' | 'EUR' | 'GBP' | 'JPY';

/**
 * 결제 제공업체
 */
export type PaymentProvider = 'portone' | 'paypal';

/**
 * 상품 카테고리
 */
export type ProductCategory = 'stars' | 'bonus' | 'premium';

/**
 * 결제 단계
 */
export type PaymentStep = 
  | 'region'        // 지역 선택
  | 'product'       // 상품 선택
  | 'payment'       // 결제 수단 선택
  | 'review'        // 결제 정보 검토
  | 'processing'    // 결제 진행 중
  | 'success'       // 결제 성공
  | 'error';        // 결제 실패

/**
 * 결제 상태
 */
export type PaymentStatus = 
  | 'idle'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ========================================================================================
// 상품 관련 타입
// ========================================================================================

/**
 * 상품 정보
 */
export interface ProductType {
  /** 상품 고유 ID */
  id: string;
  
  /** 상품 이름 */
  name: string;
  
  /** 상품 설명 */
  description: string;
  
  /** 상품 수량 */
  quantity: number;
  
  /** 상품 가격 */
  price: number;
  
  /** 통화 */
  currency: Currency;
  
  /** 아이콘 (이모지 또는 이미지 경로) */
  icon: string;
  
  /** 상품 카테고리 */
  category: ProductCategory;
  
  /** 인기 상품 여부 */
  popular?: boolean;
  
  /** 할인 정보 */
  discount?: {
    percentage: number;
    originalPrice: number;
    endDate?: Date;
  };
  
  /** 지역별 가격 차이 */
  regionalPricing?: {
    korea: number;
    global: number;
  };
}

// ========================================================================================
// 결제 수단 관련 타입
// ========================================================================================

/**
 * 결제 수단 정보
 */
export interface PaymentMethod {
  /** 결제 수단 고유 ID */
  id: string;
  
  /** 결제 수단 이름 */
  name: string;
  
  /** 아이콘 */
  icon: string;
  
  /** 결제 제공업체 */
  provider: PaymentProvider;
  
  /** 수수료 (퍼센트) */
  fees: number;
  
  /** 고정 수수료 (있는 경우) */
  fixedFee?: number;
  
  /** 지원 통화 */
  supportedCurrencies: Currency[];
  
  /** 사용 가능 여부 */
  enabled: boolean;
  
  /** 최소 결제 금액 */
  minAmount?: number;
  
  /** 최대 결제 금액 */
  maxAmount?: number;
}

// ========================================================================================
// 가격 관련 타입
// ========================================================================================

/**
 * 가격 분석 정보
 */
export interface PriceBreakdown {
  /** 상품 가격 */
  subtotal: number;
  
  /** 결제 수수료 */
  fees: number;
  
  /** 고정 수수료 */
  fixedFees: number;
  
  /** 할인 금액 */
  discount: number;
  
  /** 세금 */
  tax: number;
  
  /** 총 결제 금액 */
  total: number;
  
  /** 통화 */
  currency: Currency;
  
  /** 환율 정보 (USD 결제 시) */
  exchangeRate?: {
    rate: number;
    fromCurrency: Currency;
    toCurrency: Currency;
    updatedAt: Date;
  };
}

// ========================================================================================
// 결제 세션 및 영수증 타입
// ========================================================================================

/**
 * 결제 세션 정보
 */
export interface PaymentSession {
  /** 세션 ID */
  sessionId: string;
  
  /** 결제 토큰 */
  paymentToken: string;
  
  /** 만료 시간 */
  expiresAt: Date;
  
  /** 상품 정보 */
  product: ProductType;
  
  /** 결제 수단 */
  paymentMethod: PaymentMethod;
  
  /** 가격 정보 */
  priceBreakdown: PriceBreakdown;
  
  /** 지역 */
  region: Region;
  
  /** 사용자 ID */
  userId: string;
  
  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 결제 영수증
 */
export interface PaymentReceipt {
  /** 영수증 ID */
  receiptId: string;
  
  /** 결제 ID */
  paymentId: string;
  
  /** 거래 ID (외부 결제사) */
  transactionId: string;
  
  /** 결제 상태 */
  status: PaymentStatus;
  
  /** 결제 완료 시간 */
  completedAt: Date;
  
  /** 상품 정보 */
  product: ProductType;
  
  /** 결제 수단 */
  paymentMethod: PaymentMethod;
  
  /** 최종 가격 정보 */
  priceBreakdown: PriceBreakdown;
  
  /** 지역 */
  region: Region;
  
  /** 사용자 ID */
  userId: string;
  
  /** 환불 정보 */
  refund?: {
    refundId: string;
    amount: number;
    reason: string;
    refundedAt: Date;
  };
}

// ========================================================================================
// 에러 타입
// ========================================================================================

/**
 * 결제 에러
 */
export interface PaymentError {
  /** 에러 코드 */
  code: string;
  
  /** 에러 메시지 */
  message: string;
  
  /** 상세 정보 */
  details?: Record<string, any>;
  
  /** 복구 가능 여부 */
  recoverable: boolean;
  
  /** 재시도 가능 여부 */
  retryable: boolean;
  
  /** 사용자에게 표시할 메시지 */
  userMessage?: string;
  
  /** 발생 시간 */
  timestamp: Date;
}

// ========================================================================================
// 컴포넌트 Props 타입
// ========================================================================================

/**
 * PaymentModal 메인 컴포넌트 Props
 */
export interface PaymentModalProps extends BaseDialogProps {
  /** IP 기반 자동 감지된 지역 */
  detectedRegion?: Region;
  
  /** 초기 선택된 상품 (옵션) */
  initialProduct?: ProductType;
  
  /** 초기 지역 설정 (감지된 지역보다 우선) */
  initialRegion?: Region;
  
  /** 결제 완료 콜백 */
  onPaymentSuccess?: (receipt: PaymentReceipt) => void;
  
  /** 결제 실패 콜백 */
  onPaymentError?: (error: PaymentError) => void;
  
  /** 결제 취소 콜백 */
  onPaymentCancel?: () => void;
  
  /** 디버그 모드 */
  debug?: boolean;
  
  /** 커스텀 테마 */
  theme?: PaymentModalTheme;
}

/**
 * RegionSelector 컴포넌트 Props
 */
export interface RegionSelectorProps {
  /** 현재 선택된 지역 */
  selectedRegion: Region;
  
  /** IP 기반 감지된 지역 */
  detectedRegion?: Region;
  
  /** 지역 변경 콜백 */
  onRegionChange: (region: Region) => void;
  
  /** 비활성화 여부 */
  disabled?: boolean;
  
  /** 로딩 상태 */
  loading?: boolean;
  
  /** 클래스명 */
  className?: string;
}

/**
 * ProductSelector 컴포넌트 Props
 */
export interface ProductSelectorProps {
  /** 현재 선택된 상품 */
  selectedProduct?: ProductType;
  
  /** 상품 선택 콜백 */
  onProductSelect: (product: ProductType) => void;
  
  /** 현재 지역 */
  region: Region;
  
  /** 사용 가능한 상품 목록 */
  products?: ProductType[];
  
  /** 로딩 상태 */
  loading?: boolean;
  
  /** 에러 상태 */
  error?: string;
  
  /** 클래스명 */
  className?: string;
}

/**
 * PaymentMethodSelector 컴포넌트 Props
 */
export interface PaymentMethodSelectorProps {
  /** 현재 지역 */
  region: Region;
  
  /** 현재 선택된 결제 수단 */
  selectedMethod?: PaymentMethod;
  
  /** 결제 수단 선택 콜백 */
  onMethodSelect: (method: PaymentMethod) => void;
  
  /** 사용 가능한 결제 수단 목록 */
  paymentMethods?: PaymentMethod[];
  
  /** 선택된 상품 (수수료 계산용) */
  product?: ProductType;
  
  /** 로딩 상태 */
  loading?: boolean;
  
  /** 에러 상태 */
  error?: string;
  
  /** 클래스명 */
  className?: string;
}

/**
 * PriceTable 컴포넌트 Props
 */
export interface PriceTableProps {
  /** 선택된 상품 */
  product?: ProductType;
  
  /** 선택된 결제 수단 */
  paymentMethod?: PaymentMethod;
  
  /** 현재 지역 */
  region: Region;
  
  /** 가격 분석 정보 */
  priceBreakdown?: PriceBreakdown;
  
  /** 로딩 상태 */
  loading?: boolean;
  
  /** 에러 상태 */
  error?: string;
  
  /** 간략 모드 */
  compact?: boolean;
  
  /** 클래스명 */
  className?: string;
}

/**
 * API에서 받아오는 결제 요율 데이터 (React Query용)
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
 * PaymentRateTable 컴포넌트 Props
 */
export interface PaymentRateTableProps {
  /** 표시할 지역 */
  region: Region;
  /** 표시할 통화 */
  currency?: Currency;
  /** 컴팩트 모드 여부 */
  isCompact?: boolean;
  /** 특정 결제 수단만 표시 */
  showOnly?: string[];
  /** 프로모션 할인 정보 */
  promotional?: {
    discount: number;
    validUntil: Date;
    description: string;
  };
  /** 테이블 제목 */
  title?: string;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 결제 수단 선택 가능 여부 */
  selectable?: boolean;
  /** 선택된 결제 수단 ID */
  selectedPaymentId?: string;
  /** 결제 수단 선택 시 콜백 */
  onPaymentSelect?: (paymentId: string, paymentData: PaymentRateApiData) => void;
  /** 상세 정보 표시 여부 */
  showDetails?: boolean;
  /** 로딩 상태 표시 여부 */
  showLoadingStates?: boolean;
}

/**
 * PaymentActions 컴포넌트 Props
 */
export interface PaymentActionsProps {
  /** 결제 진행 가능 여부 */
  canProceed: boolean;
  
  /** 로딩 상태 */
  isLoading: boolean;
  
  /** 현재 단계 */
  currentStep: PaymentStep;
  
  /** 취소 콜백 */
  onCancel: () => void;
  
  /** 이전 단계로 돌아가기 */
  onBack?: () => void;
  
  /** 다음 단계 진행 */
  onNext?: () => void;
  
  /** 결제 진행 콜백 */
  onProceed: () => Promise<void>;
  
  /** 커스텀 버튼 텍스트 */
  cancelText?: string;
  backText?: string;
  nextText?: string;
  proceedText?: string;
  
  /** 클래스명 */
  className?: string;
}

// ========================================================================================
// 상태 관리 타입
// ========================================================================================

/**
 * PaymentModal 상태
 */
export interface PaymentModalState {
  // UI 상태
  currentStep: PaymentStep;
  isLoading: boolean;
  error?: PaymentError;
  
  // 지역 정보
  selectedRegion: Region;
  detectedRegion?: Region;
  
  // 선택 정보
  selectedProduct?: ProductType;
  selectedPaymentMethod?: PaymentMethod;
  
  // 가격 정보
  priceBreakdown?: PriceBreakdown;
  
  // 결제 진행
  paymentSession?: PaymentSession;
  paymentStatus: PaymentStatus;
  receipt?: PaymentReceipt;
  
  // 플로우 히스토리
  stepHistory: PaymentStep[];
  
  // 메타데이터
  metadata: {
    startedAt: number;
    userAgent: string;
    sessionId: string;
  };
  
  // 데이터
  availableProducts?: ProductType[];
  availablePaymentMethods?: PaymentMethod[];
  
  // 설정
  debug?: boolean;
}

// ========================================================================================
// 훅 타입
// ========================================================================================

/**
 * usePaymentModal 훅 반환 타입
 */
export interface UsePaymentModalReturn {
  // 상태
  state: PaymentModalState;
  
  // 액션
  actions: {
    setRegion: (region: Region) => void;
    selectProduct: (product: ProductType) => void;
    selectPaymentMethod: (method: PaymentMethod) => void;
    goToStep: (step: PaymentStep) => void;
    goToNextStep: () => void;
    goToPreviousStep: () => void;
    startPayment: () => Promise<void>;
    cancelPayment: () => void;
    resetModal: () => void;
  };
  
  // 계산된 값
  computed: {
    canProceed: boolean;
    isValidSelection: boolean;
    currentStepIndex: number;
    totalSteps: number;
    progressPercentage: number;
  };
}

/**
 * useRegionDetection 훅 반환 타입
 */
export interface UseRegionDetectionReturn {
  /** 감지된 지역 */
  detectedRegion: Region | null;
  
  /** 감지 중 여부 */
  isDetecting: boolean;
  
  /** 감지 에러 */
  error?: string;
  
  /** 수동으로 지역 감지 재시도 */
  retryDetection: () => void;
}

/**
 * usePaymentFlow 훅 반환 타입
 */
export interface UsePaymentFlowReturn {
  /** 결제 진행 함수 */
  processPayment: (session: PaymentSession) => Promise<PaymentReceipt>;
  
  /** 결제 상태 */
  status: PaymentStatus;
  
  /** 진행률 (0-100) */
  progress: number;
  
  /** 에러 정보 */
  error?: PaymentError;
  
  /** 결제 취소 */
  cancelPayment: () => void;
}

// ========================================================================================
// 테마 타입
// ========================================================================================

/**
 * PaymentModal 테마
 */
export interface PaymentModalTheme {
  /** 색상 설정 */
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    background: string;
    surface: string;
    border: string;
    text: {
      primary: string;
      secondary: string;
      muted: string;
    };
  };
  
  /** 간격 설정 */
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  
  /** 테두리 반지름 */
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
  };
  
  /** 그림자 */
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

// ========================================================================================
// API 응답 타입
// ========================================================================================

/**
 * 상품 목록 API 응답
 */
export interface ProductsResponse {
  products: ProductType[];
  region: Region;
  currency: Currency;
}

/**
 * 결제 수단 목록 API 응답
 */
export interface PaymentMethodsResponse {
  methods: PaymentMethod[];
  region: Region;
  currency: Currency;
}

/**
 * 가격 계산 API 응답
 */
export interface PriceCalculationResponse {
  priceBreakdown: PriceBreakdown;
  session?: PaymentSession;
}

/**
 * 결제 시작 API 응답
 */
export interface PaymentInitResponse {
  session: PaymentSession;
  redirectUrl?: string;
  sdkConfig?: Record<string, any>;
}

/**
 * 결제 완료 API 응답
 */
export interface PaymentCompleteResponse {
  receipt: PaymentReceipt;
  userUpdate: {
    stars: number;
    bonus: number;
    premium: boolean;
  };
}