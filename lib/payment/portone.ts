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
    this.config = {
      storeId: process.env.NEXT_PUBLIC_PORTONE_STORE_ID || '',
      channelKey: process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY || '',
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
      if (window.PortOne) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.portone.io/v2/browser-sdk.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Port One v2 SDK'));
      
      document.head.appendChild(script);
    });
  }

  /**
   * Request payment through Port One v2 with simplified flow
   */
  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Ensure SDK is initialized
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Port One v2 SDK not initialized');
      }

      // Prepare payment request for v2 API
      const paymentRequest = {
        storeId: this.config.storeId,
        channelKey: this.config.channelKey,
        paymentId: request.paymentId,
        orderName: request.orderName,
        totalAmount: request.totalAmount,
        currency: request.currency,
        payMethod: request.payMethod,
        customer: {
          fullName: request.customer.fullName,
          email: request.customer.email,
          phoneNumber: request.customer.phoneNumber,
        },
        customData: {
          productId: request.productInfo.id,
          starCandy: request.productInfo.starCandy,
          bonusAmount: request.productInfo.bonusAmount,
        },
        redirectUrl: `${window.location.origin}/api/payment/portone/callback`,
        noticeUrl: `${window.location.origin}/api/payment/portone/webhook`,
        confirmUrl: `${window.location.origin}/api/payment/portone/confirm`,
      };

      // Request payment using v2 API
      const response = await window.PortOne.requestPayment(paymentRequest);

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