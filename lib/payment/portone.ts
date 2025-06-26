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
   * Initialize Port One SDK
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      // Load Port One SDK script
      await this.loadScript();
      
      // Initialize with store ID
      if (window.PortOne) {
        window.PortOne.init({
          storeId: this.config.storeId,
          channelKey: this.config.channelKey,
        });
        
        this.isInitialized = true;
        console.log('Port One SDK initialized successfully');
        return true;
      }
      
      throw new Error('Port One SDK not loaded');
    } catch (error) {
      console.error('Failed to initialize Port One SDK:', error);
      return false;
    }
  }

  /**
   * Load Port One SDK script
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
      script.onerror = () => reject(new Error('Failed to load Port One SDK'));
      
      document.head.appendChild(script);
    });
  }

  /**
   * Request payment through Port One
   */
  async requestPayment(request: PaymentRequest): Promise<PaymentResponse> {
    try {
      // Ensure SDK is initialized
      const initialized = await this.initialize();
      if (!initialized) {
        throw new Error('Port One SDK not initialized');
      }

      // Generate unique order ID
      const orderId = `${request.paymentId}_${Date.now()}`;

      // Request payment
      const response = await window.PortOne.requestPayment({
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
          userId: request.customer.email, // Using email as user identifier
        },
        redirectUrl: `${window.location.origin}/api/payment/portone/callback`,
      });

      if (response.code === 'PAYMENT_COMPLETE') {
        return {
          success: true,
          paymentId: response.paymentId,
          transactionId: response.transactionId,
        };
      } else {
        return {
          success: false,
          error: {
            code: response.code || 'UNKNOWN_ERROR',
            message: response.message || 'Payment failed',
          },
        };
      }
    } catch (error) {
      console.error('Payment request error:', error);
      return {
        success: false,
        error: {
          code: 'PAYMENT_ERROR',
          message: error instanceof Error ? error.message : 'Payment processing failed',
        },
      };
    }
  }

  /**
   * Verify payment status
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
   * Get available payment methods
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
}

// Export singleton instance
export const portOneService = new PortOneService();