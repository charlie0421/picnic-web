import { loadScript, PayPalNamespace } from '@paypal/paypal-js';

interface PayPalConfig {
  clientId: string;
  environment: 'sandbox' | 'production';
  currency: 'USD';
}

interface PayPalOrderData {
  productId: string;
  productName: string;
  amount: number;
  starCandy: number;
  bonusAmount: number;
  userId: string;
  userEmail: string;
}

interface PayPalOrderResponse {
  id: string;
  status: string;
  purchase_units: Array<{
    amount: {
      currency_code: string;
      value: string;
    };
    description: string;
  }>;
}

class PayPalService {
  private config: PayPalConfig;
  private paypal: PayPalNamespace | null = null;
  private isInitialized: boolean = false;

  constructor() {
    this.config = {
      clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || '',
      environment: (process.env.NEXT_PUBLIC_PAYPAL_ENV as 'sandbox' | 'production') || 'sandbox',
      currency: 'USD',
    };
  }

  /**
   * Initialize PayPal SDK
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.paypal) return true;

    try {
      this.paypal = await loadScript({
        clientId: this.config.clientId,
        currency: this.config.currency,
        enableFunding: 'paypal',
        disableFunding: 'card,credit,paylater',
        dataSdkIntegrationSource: 'integrationbuilder_ac',
      });

      if (!this.paypal) {
        throw new Error('PayPal SDK failed to load');
      }

      this.isInitialized = true;
      console.log('PayPal SDK initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize PayPal SDK:', error);
      return false;
    }
  }

  /**
   * Create PayPal order
   */
  async createOrder(orderData: PayPalOrderData): Promise<string> {
    try {
      const response = await fetch('/api/payment/paypal/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          productId: orderData.productId,
          productName: orderData.productName,
          amount: orderData.amount,
          starCandy: orderData.starCandy,
          bonusAmount: orderData.bonusAmount,
          userId: orderData.userId,
          userEmail: orderData.userEmail,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create order');
      }

      return data.orderID;
    } catch (error) {
      console.error('Error creating PayPal order:', error);
      throw error;
    }
  }

  /**
   * Capture PayPal order
   */
  async captureOrder(orderID: string): Promise<any> {
    try {
      const response = await fetch('/api/payment/paypal/capture-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ orderID }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to capture order');
      }

      return data;
    } catch (error) {
      console.error('Error capturing PayPal order:', error);
      throw error;
    }
  }

  /**
   * Get PayPal SDK instance
   */
  getPayPal(): PayPalNamespace | null {
    return this.paypal;
  }

  /**
   * Format price for display
   */
  formatPrice(amount: number): string {
    return `$${amount.toFixed(2)}`;
  }

  /**
   * Check if PayPal is available in the user's country
   */
  isAvailableInCountry(countryCode: string): boolean {
    // PayPal is available in most countries except a few
    const unsupportedCountries = ['KP', 'IR', 'CU', 'SY', 'SD'];
    return !unsupportedCountries.includes(countryCode.toUpperCase());
  }

  /**
   * Get PayPal button style configuration
   */
  getButtonStyle() {
    return {
      layout: 'vertical' as const,
      color: 'blue' as const,
      shape: 'rect' as const,
      label: 'paypal' as const,
      height: 45,
    };
  }
}

// Export singleton instance
export const payPalService = new PayPalService();