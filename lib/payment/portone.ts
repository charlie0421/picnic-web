interface PortOneConfig {
  storeId: string;
  channelKey: string;
  environment: 'test' | 'production';
}

interface PaymentRequest {
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: 'KRW';
  payMethod: 'CARD' | 'TRANS' | 'VBANK' | 'PHONE';
  customer: {
    userId: string; // 웹훅에서 사용자 식별용
    fullName: string;
    email: string;
    phoneNumber?: string;
  };
  productInfo: {
    id: string;
    name: string;
    starCandy: number;
    bonusAmount: number;
  };
}

interface PaymentResponse {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  error?: {
    code: string;
    message: string;
  };
}

declare global {
  interface Window {
    PortOne?: any;
  }
}

class PortOneService {
  private config: PortOneConfig;
  private isInitialized: boolean = false;

  constructor() {
    const storeId = process.env.NEXT_PUBLIC_PORTONE_STORE_ID || '';
    const channelKey = process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || '';
    
    if (!storeId || !channelKey) {
      console.warn(
        'PortOne 환경 변수가 설정되지 않았습니다. ' +
        'NEXT_PUBLIC_PORTONE_STORE_ID와 NEXT_PUBLIC_PORTONE_CHANNEL_KEY를 확인해주세요.'
      );
    }
    
    this.config = {
      storeId,
      channelKey,
      environment: (process.env.NEXT_PUBLIC_PORTONE_ENV as 'test' | 'production') || 'test',
    };
  }

  /**
   * Initialize Port One v2 SDK
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Load Port One v2 SDK script
      await this.loadScript();
      
      this.isInitialized = true;
      console.log('Port One v2 SDK initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Port One v2 SDK:', error);
      return false;
    }
  }

  /**
   * Load Port One v2 SDK script
   */
  private loadScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.PortOne && typeof window.PortOne.requestPayment === 'function') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.portone.io/v2/browser-sdk.js';
      script.async = true;
      script.onload = () => {
        // Wait for PortOne to be available with retry logic
        const checkPortOne = (attempts = 0) => {
          if (window.PortOne && typeof window.PortOne.requestPayment === 'function') {
            resolve();
          } else if (attempts < 10) {
            // Retry up to 10 times (1 second total)
            setTimeout(() => checkPortOne(attempts + 1), 100);
          } else {
            reject(new Error('Port One SDK loaded but PortOne object is not available'));
          }
        };
        checkPortOne();
      };
      script.onerror = () => reject(new Error('Failed to load Port One v2 SDK'));
      
      document.head.appendChild(script);
    });
  }

  /**
   * Request payment through Port One v2 with simplified flow
   */
  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Validate required configuration
      if (!this.config.storeId || !this.config.channelKey) {
        throw new Error(
          'PortOne 설정이 완료되지 않았습니다. ' +
          'NEXT_PUBLIC_PORTONE_STORE_ID와 NEXT_PUBLIC_PORTONE_CHANNEL_KEY 환경 변수를 확인해주세요.'
        );
      }

      // Ensure SDK is initialized
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Port One v2 SDK not initialized');
      }

      // Validate storeId before creating payment request
      if (!this.config.storeId || !this.config.channelKey) {
        throw new Error(
          'PortOne 설정이 완료되지 않았습니다. ' +
          'NEXT_PUBLIC_PORTONE_STORE_ID와 NEXT_PUBLIC_PORTONE_CHANNEL_KEY 환경 변수를 확인해주세요.'
        );
      }

      // Prepare payment request for v2 API
      // 포트원 v2 브라우저 SDK는 paymentId를 merchant_uid로 사용
      const paymentRequest = {
        storeId: this.config.storeId,
        channelKey: this.config.channelKey,
        paymentId: request.paymentId, // 이것이 merchant_uid로 사용됨
        orderName: request.orderName,
        totalAmount: request.totalAmount,
        currency: request.currency,
        payMethod: request.payMethod,
        customer: {
          fullName: request.customer.fullName,
          email: request.customer.email,
          phoneNumber: request.customer.phoneNumber,
        },
        customData: JSON.stringify({
          userId: request.customer.userId, // 웹훅에서 사용자 식별용
          productId: request.productInfo.id,
          starCandy: request.productInfo.starCandy,
          bonusAmount: request.productInfo.bonusAmount,
        }),
        redirectUrl: `${window.location.origin}/api/payment/portone/callback?returnTo=${encodeURIComponent(window.location.pathname)}&paymentId=${encodeURIComponent(request.paymentId)}`,
        noticeUrl: `${window.location.origin}/api/payment/portone/webhook`,
        confirmUrl: `${window.location.origin}/api/payment/portone/confirm`,
      };

      // Debug logging
      console.log('[PortOne] Payment request:', {
        storeId: paymentRequest.storeId,
        channelKey: paymentRequest.channelKey ? '***' : undefined,
        paymentId: paymentRequest.paymentId,
        orderName: paymentRequest.orderName,
        totalAmount: paymentRequest.totalAmount,
      });

      // Verify PortOne is available before calling
      if (!window.PortOne || typeof window.PortOne.requestPayment !== 'function') {
        throw new Error('Port One SDK is not available. Please ensure the SDK is properly loaded.');
      }

      // Request payment using v2 API
      console.log('[PortOne] Calling requestPayment with redirectUrl:', paymentRequest.redirectUrl);
      const response = await window.PortOne.requestPayment(paymentRequest);
      console.log('[PortOne] requestPayment response:', {
        code: response.code,
        paymentId: response.paymentId,
        transactionId: response.transactionId,
        message: response.message,
      });

      if (response.code === null && response.paymentId) {
        // Payment completed successfully
        return {
          success: true,
          paymentId: response.paymentId,
          transactionId: response.transactionId,
        };
      } else {
        // Payment failed or cancelled
        return {
          success: false,
          error: {
            code: response.code || 'PAYMENT_FAILED',
            message: response.message || '결제에 실패했습니다.',
          },
        };
      }
    } catch (error) {
      console.error('Port One v2 payment request error:', error);
      return {
        success: false,
        error: {
          code: 'PAYMENT_ERROR',
          message: error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.',
        },
      };
    }
  }

  /**
   * Request payment with automatic payment method detection
   */
  async requestPaymentAuto(request: Omit<PaymentRequest, 'payMethod'>): Promise<PaymentResponse> {
    // For auto payment, we'll use CARD as default but let Port One handle the selection
    return this.requestPayment({
      ...request,
      payMethod: 'CARD', // Port One v2 will show payment method selection UI
    });
  }

  /**
   * Verify payment status on server
   */
  async verifyPayment(paymentId: string): Promise<boolean> {
    try {
      const response = await fetch('/api/payment/portone/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentId }),
      });

      const result = await response.json();
      return result.verified === true;
    } catch (error) {
      console.error('Payment verification error:', error);
      return false;
    }
  }

  /**
   * Get available payment methods for Korean users
   */
  getAvailablePaymentMethods() {
    return [
      { id: 'CARD', name: '신용/체크카드', icon: '💳' },
      { id: 'TRANS', name: '실시간 계좌이체', icon: '🏦' },
      { id: 'VBANK', name: '가상계좌', icon: '📱' },
      { id: 'PHONE', name: '휴대폰 소액결제', icon: '📞' },
    ];
  }

  /**
   * Format price for display
   */
  formatPrice(amount: number): string {
    return `₩${amount.toLocaleString('ko-KR')}`;
  }

  /**
   * Check if Port One is available (mainly for Korean users)
   */
  isAvailableInCountry(countryCode: string): boolean {
    // Port One is primarily for Korean market
    return countryCode.toUpperCase() === 'KR';
  }
}

// Export singleton instance
export const portOneService = new PortOneService();