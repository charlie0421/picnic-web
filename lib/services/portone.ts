// =====================================================================================
// PORT ONE SDK INTEGRATION SERVICE
// =====================================================================================
// 한국 시장용 Port One 결제 서비스 통합
// Payment 컴포넌트에서 한국 사용자를 위한 결제 처리에 사용됨
// =====================================================================================

// Port One SDK 타입 정의 (실제 SDK 대신 임시 타입)
interface PortOne {
  requestPayment: (data: any) => Promise<any>;
}

// SDK 로딩 함수 모의 구현
async function loadPortOne(storeId: string, channelKey: string): Promise<PortOne> {
  // 실제 환경에서는 Port One SDK를 로드
  console.warn('Port One SDK not loaded - using mock implementation');
  return {
    requestPayment: async (data: any) => {
      // 모의 응답
      return {
        success: false,
        error_code: 'SDK_NOT_LOADED',
        error_msg: 'Port One SDK is not properly loaded'
      };
    }
  };
}
import type { 
  Region, 
  PaymentProvider, 
  PaymentStatus,
  Currency
} from '@/components/client/vote/dialogs/payment/types';

// PaymentMethod는 interface이므로 별도 타입 정의
type SimplePaymentMethod = 'card' | 'bank_transfer' | 'virtual_account' | 'mobile' | 'easy_pay' | 'gift_card' | 'point';

/**
 * Port One 결제 요청 인터페이스
 */
export interface PortOnePaymentRequest {
  // 기본 정보
  merchant_uid: string;           // 고유 주문번호
  name: string;                   // 상품명
  amount: number;                 // 결제금액
  currency: Currency;             // 통화
  
  // 구매자 정보
  buyer_name?: string;           // 구매자 이름
  buyer_tel?: string;            // 구매자 전화번호
  buyer_email?: string;          // 구매자 이메일
  buyer_addr?: string;           // 구매자 주소
  buyer_postcode?: string;       // 구매자 우편번호
  
  // 결제 수단 정보
  pay_method: 'card' | 'trans' | 'vbank' | 'phone' | 'samsung' | 'kpay' | 'kakaopay' | 'payco' | 'lpay' | 'ssgpay' | 'tosspay' | 'culturepay' | 'smartculture' | 'happymoney' | 'point' | 'wechat' | 'alipay' | 'paypal' | 'bitcoin';
  pg?: string;                   // PG사 구분코드
  
  // 옵션
  digital?: boolean;             // 실물/디지털 구분
  vbank_due?: string;           // 가상계좌 입금기한 (YYYYMMDDHHMM)
  m_redirect_url?: string;       // 모바일 결제완료 후 리다이렉트 URL
  app_scheme?: string;           // 모바일 앱 스킴
  
  // 커스텀 데이터
  custom_data?: Record<string, any>;
}

/**
 * Port One 결제 응답 인터페이스
 */
export interface PortOnePaymentResponse {
  success: boolean;
  imp_uid?: string;              // Port One 거래고유번호
  merchant_uid?: string;         // 가맹점 주문번호
  pay_method?: string;           // 결제수단
  paid_amount?: number;          // 결제금액
  status?: string;               // 결제상태
  name?: string;                 // 상품명
  pg_provider?: string;          // PG사명
  pg_tid?: string;               // PG사 거래번호
  buyer_name?: string;           // 구매자명
  buyer_email?: string;          // 구매자 이메일
  buyer_tel?: string;            // 구매자 전화번호
  buyer_addr?: string;           // 구매자 주소
  buyer_postcode?: string;       // 구매자 우편번호
  custom_data?: Record<string, any>; // 커스텀 데이터
  paid_at?: number;              // 결제승인시각 (Unix timestamp)
  receipt_url?: string;          // 매출전표 URL
  
  // 에러 정보 (결제 실패시)
  error_code?: string;
  error_msg?: string;
}

/**
 * Port One 설정 인터페이스
 */
export interface PortOneConfig {
  storeId: string;               // 상점아이디
  channelKey: string;            // 채널 키
  environment: 'sandbox' | 'live'; // 환경구분
  debug?: boolean;               // 디버그 모드
}

/**
 * Port One 에러 클래스
 */
export class PortOneError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PortOneError';
  }
}

/**
 * Port One 서비스 클래스
 */
export class PortOneService {
  private portone: PortOne | null = null;
  private config: PortOneConfig;
  private isInitialized = false;

  constructor(config: PortOneConfig) {
    this.config = config;
  }

  /**
   * Port One SDK 초기화
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized && this.portone) {
        return;
      }

      // Port One SDK 로드
      this.portone = await loadPortOne(this.config.storeId, this.config.channelKey);
      
      if (!this.portone) {
        throw new PortOneError(
          'Failed to load Port One SDK',
          'SDK_LOAD_FAILED'
        );
      }

      this.isInitialized = true;

      if (this.config.debug) {
        console.log('Port One SDK initialized successfully', {
          storeId: this.config.storeId,
          environment: this.config.environment
        });
      }
    } catch (error) {
      throw new PortOneError(
        `Port One SDK initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * 결제 요청
   */
  async requestPayment(paymentData: PortOnePaymentRequest): Promise<PortOnePaymentResponse> {
    if (!this.isInitialized || !this.portone) {
      throw new PortOneError(
        'Port One SDK is not initialized',
        'SDK_NOT_INITIALIZED'
      );
    }

    try {
      // 결제 데이터 검증
      this.validatePaymentRequest(paymentData);

      if (this.config.debug) {
        console.log('Requesting payment:', paymentData);
      }

      // Port One 결제 요청
      const response = await this.portone.requestPayment(paymentData);

      if (this.config.debug) {
        console.log('Payment response:', response);
      }

      // 응답 처리
      if (response.success) {
        return {
          success: true,
          imp_uid: response.imp_uid,
          merchant_uid: response.merchant_uid,
          pay_method: response.pay_method,
          paid_amount: response.paid_amount,
          status: response.status,
          name: response.name,
          pg_provider: response.pg_provider,
          pg_tid: response.pg_tid,
          buyer_name: response.buyer_name,
          buyer_email: response.buyer_email,
          buyer_tel: response.buyer_tel,
          buyer_addr: response.buyer_addr,
          buyer_postcode: response.buyer_postcode,
          custom_data: response.custom_data,
          paid_at: response.paid_at,
          receipt_url: response.receipt_url
        };
      } else {
        throw new PortOneError(
          response.error_msg || 'Payment failed',
          response.error_code || 'PAYMENT_FAILED',
          response
        );
      }
    } catch (error) {
      if (error instanceof PortOneError) {
        throw error;
      }
      
      throw new PortOneError(
        `Payment request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PAYMENT_REQUEST_FAILED',
        error
      );
    }
  }

  /**
   * 결제 요청 데이터 검증
   */
  private validatePaymentRequest(paymentData: PortOnePaymentRequest): void {
    if (!paymentData.merchant_uid) {
      throw new PortOneError(
        'merchant_uid is required',
        'VALIDATION_ERROR'
      );
    }

    if (!paymentData.name) {
      throw new PortOneError(
        'Product name is required',
        'VALIDATION_ERROR'
      );
    }

    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new PortOneError(
        'Valid amount is required',
        'VALIDATION_ERROR'
      );
    }

    if (!paymentData.pay_method) {
      throw new PortOneError(
        'Payment method is required',
        'VALIDATION_ERROR'
      );
    }

    // 금액 범위 검증 (Port One 제한사항)
    if (paymentData.amount < 100) {
      throw new PortOneError(
        'Minimum amount is 100 KRW',
        'AMOUNT_TOO_SMALL'
      );
    }

    if (paymentData.amount > 50000000) {
      throw new PortOneError(
        'Maximum amount is 50,000,000 KRW',
        'AMOUNT_TOO_LARGE'
      );
    }
  }

  /**
   * 결제 상태 조회
   */
  async getPaymentStatus(imp_uid: string): Promise<any> {
    if (!this.isInitialized || !this.portone) {
      throw new PortOneError(
        'Port One SDK is not initialized',
        'SDK_NOT_INITIALIZED'
      );
    }

    try {
      // 실제로는 서버 사이드에서 Port One REST API를 호출해야 함
      // 클라이언트에서는 보안상 제한적인 기능만 제공
      console.warn('Payment status check should be implemented on server side');
      
      return {
        imp_uid,
        status: 'pending',
        message: 'Status check should be implemented on server side'
      };
    } catch (error) {
      throw new PortOneError(
        `Failed to get payment status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STATUS_CHECK_FAILED',
        error
      );
    }
  }

  /**
   * 결제 취소 (부분 취소 지원)
   */
  async cancelPayment(imp_uid: string, amount?: number, reason?: string): Promise<any> {
    if (!this.isInitialized || !this.portone) {
      throw new PortOneError(
        'Port One SDK is not initialized',
        'SDK_NOT_INITIALIZED'
      );
    }

    try {
      // 실제로는 서버 사이드에서 Port One REST API를 호출해야 함
      console.warn('Payment cancellation should be implemented on server side');
      
      return {
        imp_uid,
        cancel_amount: amount,
        cancel_reason: reason,
        status: 'cancelled',
        message: 'Cancellation should be implemented on server side'
      };
    } catch (error) {
      throw new PortOneError(
        `Failed to cancel payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CANCELLATION_FAILED',
        error
      );
    }
  }

  /**
   * Port One 결제수단을 내부 SimplePaymentMethod로 변환
   */
  static mapPortOnePayMethodToInternal(portoneMethod: string): SimplePaymentMethod {
    const methodMap: Record<string, SimplePaymentMethod> = {
      'card': 'card',
      'trans': 'bank_transfer', 
      'vbank': 'virtual_account',
      'phone': 'mobile',
      'samsung': 'easy_pay',
      'kpay': 'easy_pay',
      'kakaopay': 'easy_pay',
      'payco': 'easy_pay',
      'lpay': 'easy_pay',
      'ssgpay': 'easy_pay',
      'tosspay': 'easy_pay',
      'culturepay': 'gift_card',
      'smartculture': 'gift_card',
      'happymoney': 'gift_card',
      'point': 'point'
    };

    return methodMap[portoneMethod] || 'card';
  }

  /**
   * 내부 SimplePaymentMethod를 Port One 결제수단으로 변환
   */
  static mapInternalPayMethodToPortOne(internalMethod: SimplePaymentMethod): string {
    const methodMap: Record<SimplePaymentMethod, string> = {
      'card': 'card',
      'bank_transfer': 'trans',
      'virtual_account': 'vbank',
      'mobile': 'phone',
      'easy_pay': 'kakaopay', // 기본값으로 카카오페이 사용
      'gift_card': 'culturepay',
      'point': 'point'
    };

    return methodMap[internalMethod] || 'card';
  }

  /**
   * Port One 결제 상태를 내부 PaymentStatus로 변환
   */
  static mapPortOneStatusToInternal(portoneStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'ready': 'pending',
      'paid': 'completed',
      'cancelled': 'cancelled',
      'failed': 'failed'
    };

    return statusMap[portoneStatus] || 'pending';
  }

  /**
   * SDK 정리
   */
  cleanup(): void {
    this.portone = null;
    this.isInitialized = false;
    
    if (this.config.debug) {
      console.log('Port One SDK cleaned up');
    }
  }
}

/**
 * 기본 Port One 설정 생성
 */
export function createPortOneConfig(environment: 'sandbox' | 'live' = 'sandbox'): PortOneConfig {
  // 실제 환경에서는 환경변수에서 읽어오거나 secure store에서 가져와야 함
  const configs = {
    sandbox: {
      storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID || 'store-test-id',
      channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || 'channel-key-test',
      environment: 'sandbox' as const,
      debug: process.env.NODE_ENV === 'development'
    },
    live: {
      storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID_LIVE || '',
      channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY_LIVE || '',
      environment: 'live' as const,
      debug: false
    }
  };

  return configs[environment];
}

/**
 * 글로벌 Port One 서비스 인스턴스
 */
let globalPortOneService: PortOneService | null = null;

/**
 * Port One 서비스 싱글톤 인스턴스 획득
 */
export function getPortOneService(environment: 'sandbox' | 'live' = 'sandbox'): PortOneService {
  if (!globalPortOneService) {
    const config = createPortOneConfig(environment);
    globalPortOneService = new PortOneService(config);
  }
  
  return globalPortOneService;
}

/**
 * 고유 주문번호 생성 유틸리티
 */
export function generateMerchantUid(prefix = 'picnic'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * 한국 결제 수단 목록 획득
 */
export function getKoreanPaymentMethods(): Array<{
  id: string;
  name: string;
  method: string;
  pg?: string;
  icon?: string;
}> {
  return [
    {
      id: 'card',
      name: '신용/체크카드',
      method: 'card',
      icon: '💳'
    },
    {
      id: 'trans',
      name: '실시간 계좌이체',
      method: 'trans',
      icon: '🏦'
    },
    {
      id: 'vbank',
      name: '가상계좌',
      method: 'vbank',
      icon: '🏧'
    },
    {
      id: 'phone',
      name: '휴대폰 소액결제',
      method: 'phone',
      icon: '📱'
    },
    {
      id: 'kakaopay',
      name: '카카오페이',
      method: 'kakaopay',
      icon: '🍋'
    },
    {
      id: 'tosspay',
      name: '토스페이',
      method: 'tosspay', 
      icon: '💙'
    },
    {
      id: 'payco',
      name: 'PAYCO',
      method: 'payco',
      icon: '🅿️'
    },
    {
      id: 'ssgpay',
      name: 'SSG페이',
      method: 'ssgpay',
      icon: '🛒'
    }
  ];
}

// Types are already exported inline above