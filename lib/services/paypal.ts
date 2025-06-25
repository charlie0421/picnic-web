// =====================================================================================
// PAYPAL SDK INTEGRATION SERVICE
// =====================================================================================
// 글로벌 시장용 PayPal 결제 서비스 통합
// Payment 컴포넌트에서 글로벌 사용자를 위한 결제 처리에 사용됨
// =====================================================================================

import { loadScript } from '@paypal/paypal-js';
import type { 
  Region, 
  PaymentProvider, 
  PaymentStatus,
  Currency
} from '@/components/client/vote/dialogs/payment/types';

// PayPal에서 사용하는 간단한 PaymentMethod 타입
type SimplePaymentMethod = 'card' | 'bank_transfer' | 'virtual_account' | 'mobile' | 'easy_pay' | 'gift_card' | 'point';

/**
 * PayPal 결제 요청 인터페이스
 */
export interface PayPalPaymentRequest {
  // 기본 정보
  intent: 'CAPTURE' | 'AUTHORIZE';    // 결제 의도
  amount: {
    currency_code: Currency;           // 통화
    value: string;                     // 금액 (문자열)
  };
  
  // 상품 정보
  items?: Array<{
    name: string;                      // 상품명
    unit_amount: {
      currency_code: Currency;
      value: string;
    };
    quantity: string;                  // 수량
    description?: string;              // 상품 설명
    sku?: string;                      // SKU
    category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS';
  }>;
  
  // 주문 정보
  reference_id?: string;               // 참조 ID
  description?: string;                // 주문 설명
  custom_id?: string;                  // 커스텀 ID
  invoice_id?: string;                 // 인보이스 ID
  soft_descriptor?: string;            // 신용카드 명세서 표시명
  
  // 구매자 정보
  payer?: {
    name?: {
      given_name: string;
      surname: string;
    };
    email_address?: string;
    payer_id?: string;
    phone?: {
      phone_type?: 'FAX' | 'HOME' | 'MOBILE' | 'OTHER' | 'PAGER';
      phone_number: {
        national_number: string;
      };
    };
    address?: {
      address_line_1?: string;
      address_line_2?: string;
      admin_area_2?: string;           // 도시
      admin_area_1?: string;           // 주/도
      postal_code?: string;
      country_code: string;            // 국가코드 (ISO 3166-1 alpha-2)
    };
  };
  
  // 배송 정보
  shipping?: {
    type?: 'SHIPPING' | 'PICKUP_IN_PERSON';
    name?: {
      full_name: string;
    };
    address?: {
      address_line_1?: string;
      address_line_2?: string;
      admin_area_2?: string;
      admin_area_1?: string;
      postal_code?: string;
      country_code: string;
    };
  };
  
  // 애플리케이션 컨텍스트
  application_context?: {
    brand_name?: string;               // 브랜드명
    locale?: string;                   // 로케일
    landing_page?: 'LOGIN' | 'GUEST_CHECKOUT' | 'NO_PREFERENCE';
    shipping_preference?: 'GET_FROM_FILE' | 'NO_SHIPPING' | 'SET_PROVIDED_ADDRESS';
    user_action?: 'CONTINUE' | 'PAY_NOW';
    payment_method?: {
      payer_selected?: 'PAYPAL' | 'PAYPAL_CREDIT';
      payee_preferred?: 'UNRESTRICTED' | 'IMMEDIATE_PAYMENT_REQUIRED';
    };
    return_url?: string;               // 성공 시 리다이렉트 URL
    cancel_url?: string;               // 취소 시 리다이렉트 URL
  };
}

/**
 * PayPal 결제 응답 인터페이스
 */
export interface PayPalPaymentResponse {
  id: string;                          // PayPal 주문 ID
  intent: string;                      // 결제 의도
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  
  // 결제 정보
  purchase_units: Array<{
    reference_id?: string;
    amount: {
      currency_code: string;
      value: string;
      breakdown?: {
        item_total?: { currency_code: string; value: string; };
        shipping?: { currency_code: string; value: string; };
        handling?: { currency_code: string; value: string; };
        tax_total?: { currency_code: string; value: string; };
        insurance?: { currency_code: string; value: string; };
        shipping_discount?: { currency_code: string; value: string; };
        discount?: { currency_code: string; value: string; };
      };
    };
    payee?: {
      email_address?: string;
      merchant_id?: string;
    };
    description?: string;
    custom_id?: string;
    invoice_id?: string;
    soft_descriptor?: string;
    items?: Array<any>;
    shipping?: any;
    payments?: {
      authorizations?: Array<any>;
      captures?: Array<{
        id: string;
        status: string;
        amount: { currency_code: string; value: string; };
        final_capture?: boolean;
        seller_protection?: any;
        seller_receivable_breakdown?: any;
        links?: Array<any>;
        create_time?: string;
        update_time?: string;
      }>;
    };
  }>;
  
  // 구매자 정보
  payer?: {
    name?: { given_name: string; surname: string; };
    email_address?: string;
    payer_id?: string;
    address?: any;
    phone?: any;
  };
  
  // 생성/업데이트 시간
  create_time?: string;
  update_time?: string;
  
  // 링크
  links?: Array<{
    href: string;
    rel: string;
    method?: string;
  }>;
}

/**
 * PayPal 설정 인터페이스
 */
export interface PayPalConfig {
  clientId: string;                    // 클라이언트 ID
  clientSecret?: string;               // 클라이언트 시크릿 (서버 사이드 전용)
  environment: 'sandbox' | 'production'; // 환경
  currency: Currency;                  // 기본 통화
  locale?: string;                     // 로케일
  intent?: 'capture' | 'authorize';    // 기본 결제 의도
  debug?: boolean;                     // 디버그 모드
  disableFunding?: string[];           // 비활성화할 결제 수단
  enableFunding?: string[];            // 활성화할 결제 수단
}

/**
 * PayPal 에러 클래스
 */
export class PayPalError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PayPalError';
  }
}

/**
 * PayPal 서비스 클래스
 */
export class PayPalService {
  private config: PayPalConfig;
  private isInitialized = false;
  private paypalInstance: any = null;

  constructor(config: PayPalConfig) {
    this.config = config;
  }

  /**
   * PayPal SDK 초기화
   */
  async initialize(): Promise<void> {
    try {
      if (this.isInitialized && this.paypalInstance) {
        return;
      }

      // PayPal SDK 로드
      this.paypalInstance = await loadScript({
        clientId: this.config.clientId,
        currency: this.config.currency,
        intent: this.config.intent || 'capture',
        locale: this.config.locale || 'en_US',
        disableFunding: this.config.disableFunding,
        enableFunding: this.config.enableFunding,
        dataPartnerAttributionId: 'Picnic_Web_App',
        debug: this.config.debug || false
      });

      if (!this.paypalInstance) {
        throw new PayPalError(
          'Failed to load PayPal SDK',
          'SDK_LOAD_FAILED'
        );
      }

      this.isInitialized = true;

      if (this.config.debug) {
        console.log('PayPal SDK initialized successfully', {
          clientId: this.config.clientId,
          environment: this.config.environment
        });
      }
    } catch (error) {
      throw new PayPalError(
        `PayPal SDK initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INITIALIZATION_FAILED',
        error
      );
    }
  }

  /**
   * PayPal 주문 생성
   */
  async createOrder(paymentData: PayPalPaymentRequest): Promise<string> {
    if (!this.isInitialized || !this.paypalInstance) {
      throw new PayPalError(
        'PayPal SDK is not initialized',
        'SDK_NOT_INITIALIZED'
      );
    }

    try {
      // 결제 데이터 검증
      this.validatePaymentRequest(paymentData);

      if (this.config.debug) {
        console.log('Creating PayPal order:', paymentData);
      }

      // PayPal 주문 생성 요청
      const order = await this.paypalInstance.Orders().create({
        intent: paymentData.intent,
        purchase_units: [{
          amount: {
            currency_code: paymentData.amount.currency_code,
            value: paymentData.amount.value,
            breakdown: paymentData.items ? {
              item_total: {
                currency_code: paymentData.amount.currency_code,
                value: paymentData.amount.value
              }
            } : undefined
          },
          items: paymentData.items,
          description: paymentData.description,
          custom_id: paymentData.custom_id,
          invoice_id: paymentData.invoice_id,
          soft_descriptor: paymentData.soft_descriptor
        }],
        payer: paymentData.payer,
        application_context: {
          brand_name: 'Picnic',
          locale: this.config.locale || 'en_US',
          landing_page: 'NO_PREFERENCE',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'PAY_NOW',
          ...paymentData.application_context
        }
      });

      if (this.config.debug) {
        console.log('PayPal order created:', order);
      }

      return order.id;
    } catch (error) {
      throw new PayPalError(
        `Failed to create PayPal order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ORDER_CREATION_FAILED',
        error
      );
    }
  }

  /**
   * PayPal 주문 승인 처리
   */
  async onApprove(data: { orderID: string; payerID?: string }): Promise<PayPalPaymentResponse> {
    if (!this.isInitialized || !this.paypalInstance) {
      throw new PayPalError(
        'PayPal SDK is not initialized',
        'SDK_NOT_INITIALIZED'
      );
    }

    try {
      if (this.config.debug) {
        console.log('Capturing PayPal order:', data);
      }

      // 주문 캡처 (실제 결제 처리)
      const orderData = await this.paypalInstance.Orders().capture(data.orderID);

      if (this.config.debug) {
        console.log('PayPal order captured:', orderData);
      }

      return orderData;
    } catch (error) {
      throw new PayPalError(
        `Failed to capture PayPal order: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'ORDER_CAPTURE_FAILED',
        error
      );
    }
  }

  /**
   * PayPal 주문 취소 처리
   */
  async onCancel(data: { orderID: string }): Promise<void> {
    if (this.config.debug) {
      console.log('PayPal order cancelled:', data);
    }
    
    // 주문 취소는 별도 처리가 필요하지 않음 (사용자가 취소한 것)
    // 필요에 따라 분석용 로깅이나 상태 업데이트 수행
  }

  /**
   * PayPal 주문 에러 처리
   */
  async onError(error: any): Promise<void> {
    console.error('PayPal order error:', error);
    
    throw new PayPalError(
      `PayPal order processing failed: ${error.message || 'Unknown error'}`,
      'ORDER_PROCESSING_FAILED',
      error
    );
  }

  /**
   * 결제 요청 데이터 검증
   */
  private validatePaymentRequest(paymentData: PayPalPaymentRequest): void {
    if (!paymentData.amount?.value || parseFloat(paymentData.amount.value) <= 0) {
      throw new PayPalError(
        'Valid payment amount is required',
        'VALIDATION_ERROR'
      );
    }

    if (!paymentData.amount?.currency_code) {
      throw new PayPalError(
        'Currency code is required',
        'VALIDATION_ERROR'
      );
    }

    if (!paymentData.intent) {
      throw new PayPalError(
        'Payment intent is required',
        'VALIDATION_ERROR'
      );
    }

    // 금액 범위 검증 (PayPal 제한사항)
    const amount = parseFloat(paymentData.amount.value);
    
    if (amount < 0.01) {
      throw new PayPalError(
        'Minimum amount is 0.01',
        'AMOUNT_TOO_SMALL'
      );
    }

    if (amount > 10000) {
      throw new PayPalError(
        'Maximum amount is 10,000 per transaction',
        'AMOUNT_TOO_LARGE'
      );
    }

    // 통화별 최소 금액 검증
    const minAmounts: Record<Currency, number> = {
      'USD': 0.01,
      'EUR': 0.01,
      'GBP': 0.01,
      'JPY': 1,
      'KRW': 1
    };

    const minAmount = minAmounts[paymentData.amount.currency_code as Currency];
    if (minAmount && amount < minAmount) {
      throw new PayPalError(
        `Minimum amount for ${paymentData.amount.currency_code} is ${minAmount}`,
        'AMOUNT_TOO_SMALL'
      );
    }
  }

  /**
   * PayPal 결제 상태를 내부 PaymentStatus로 변환
   */
  static mapPayPalStatusToInternal(paypalStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'CREATED': 'pending',
      'SAVED': 'pending',
      'APPROVED': 'processing',
      'PAYER_ACTION_REQUIRED': 'pending',
      'COMPLETED': 'completed',
      'VOIDED': 'cancelled'
    };

    return statusMap[paypalStatus] || 'pending';
  }

  /**
   * PayPal 결제수단을 내부 SimplePaymentMethod로 변환
   */
  static mapPayPalMethodToInternal(paypalMethod: string): SimplePaymentMethod {
    const methodMap: Record<string, SimplePaymentMethod> = {
      'paypal': 'easy_pay',
      'card': 'card',
      'credit': 'card',
      'paylater': 'easy_pay',
      'venmo': 'easy_pay'
    };

    return methodMap[paypalMethod] || 'card';
  }

  /**
   * 지원되는 통화 목록
   */
  static getSupportedCurrencies(): Currency[] {
    return ['USD', 'EUR', 'GBP', 'JPY', 'KRW'];
  }

  /**
   * 지원되는 국가 목록 (ISO 3166-1 alpha-2)
   */
  static getSupportedCountries(): string[] {
    return [
      'US', 'CA', 'MX',           // 북미
      'GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'PT', 'IE', 'LU', // 유럽
      'AU', 'NZ',                // 오세아니아
      'JP', 'SG', 'HK', 'TW',    // 아시아
      'BR', 'AR', 'CL', 'CO'     // 남미
    ];
  }

  /**
   * SDK 정리
   */
  cleanup(): void {
    this.paypalInstance = null;
    this.isInitialized = false;
    
    if (this.config.debug) {
      console.log('PayPal SDK cleaned up');
    }
  }
}

/**
 * 기본 PayPal 설정 생성
 */
export function createPayPalConfig(environment: 'sandbox' | 'production' = 'sandbox'): PayPalConfig {
  // 실제 환경에서는 환경변수에서 읽어오거나 secure store에서 가져와야 함
  const configs = {
    sandbox: {
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'AYlQ8MmCZ8kpEw3oSolX8WkQhchWz5fxHyenJNpFYhN1Lw3QZlKNPr8ZmLV7AiKF8Wvj-n2s_5X3o1Vl',
      environment: 'sandbox' as const,
      currency: 'USD' as Currency,
      locale: 'en_US',
      intent: 'capture' as const,
      debug: process.env.NODE_ENV === 'development',
      disableFunding: [],
      enableFunding: ['paylater', 'venmo']
    },
    production: {
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID_LIVE || '',
      environment: 'production' as const,
      currency: 'USD' as Currency,
      locale: 'en_US',
      intent: 'capture' as const,
      debug: false,
      disableFunding: [],
      enableFunding: []
    }
  };

  return configs[environment];
}

/**
 * 글로벌 PayPal 서비스 인스턴스
 */
let globalPayPalService: PayPalService | null = null;

/**
 * PayPal 서비스 싱글톤 인스턴스 획득
 */
export function getPayPalService(environment: 'sandbox' | 'production' = 'sandbox'): PayPalService {
  if (!globalPayPalService) {
    const config = createPayPalConfig(environment);
    globalPayPalService = new PayPalService(config);
  }
  
  return globalPayPalService;
}

/**
 * 금액을 PayPal 형식으로 변환 (소수점 2자리)
 */
export function formatPayPalAmount(amount: number, currency: Currency = 'USD'): string {
  if (currency === 'JPY' || currency === 'KRW') {
    // 일본 엔과 한국 원은 소수점 없음
    return Math.round(amount).toString();
  }
  
  // 기타 통화는 소수점 2자리
  return amount.toFixed(2);
}

/**
 * 글로벌 결제 수단 목록 (PayPal 기반)
 */
export function getGlobalPaymentMethods(): Array<{
  id: string;
  name: string;
  method: string;
  icon?: string;
  currencies: Currency[];
}> {
  return [
    {
      id: 'paypal',
      name: 'PayPal',
      method: 'paypal',
      icon: '💙',
      currencies: ['USD', 'EUR', 'GBP', 'JPY']
    },
    {
      id: 'card',
      name: 'Credit/Debit Card',
      method: 'card',
      icon: '💳',
      currencies: ['USD', 'EUR', 'GBP', 'JPY']
    },
    {
      id: 'paylater',
      name: 'Pay in 4',
      method: 'paylater',
      icon: '💰',
      currencies: ['USD', 'EUR', 'GBP']
    },
    {
      id: 'venmo',
      name: 'Venmo',
      method: 'venmo',
      icon: '💜',
      currencies: ['USD']
    }
  ];
}

/**
 * 국가별 로케일 매핑
 */
export function getLocaleForCountry(countryCode: string): string {
  const localeMap: Record<string, string> = {
    'US': 'en_US',
    'CA': 'en_CA',
    'GB': 'en_GB',
    'FR': 'fr_FR',
    'DE': 'de_DE',
    'IT': 'it_IT',
    'ES': 'es_ES',
    'NL': 'nl_NL',
    'JP': 'ja_JP',
    'KR': 'ko_KR',
    'CN': 'zh_CN',
    'BR': 'pt_BR',
    'MX': 'es_MX'
  };

  return localeMap[countryCode] || 'en_US';
}

// Types are already exported inline above