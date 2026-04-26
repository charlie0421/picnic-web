import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  formatPrice,
  getSafeLocalizedString,
  getProductImage,
  getSortedProducts,
  FEATURED_PRODUCT_AMOUNTS,
} from '@/components/client/star-candy/star-candy-utils';

// ============================
// Unit tests for star-candy-utils
// ============================
describe('star-candy-utils', () => {
  describe('formatPrice', () => {
    it('returns empty string for null price', () => {
      expect(formatPrice(null, 'USD')).toBe('');
    });

    it('formats KRW price correctly', () => {
      expect(formatPrice(1000, 'KRW')).toBe('\u20A91,000');
    });

    it('formats USD price with two decimals', () => {
      expect(formatPrice(9.99, 'USD')).toBe('$9.99');
    });

    it('formats USD price with trailing zeros', () => {
      expect(formatPrice(5, 'USD')).toBe('$5.00');
    });
  });

  describe('getSafeLocalizedString', () => {
    it('returns empty string for null', () => {
      expect(getSafeLocalizedString(null, 'en')).toBe('');
    });

    it('returns string directly if already a string', () => {
      expect(getSafeLocalizedString('hello', 'en')).toBe('hello');
    });

    it('parses JSON string and returns correct language', () => {
      const json = JSON.stringify({ en: 'Hello', ko: '안녕' });
      expect(getSafeLocalizedString(json, 'en')).toBe('Hello');
      expect(getSafeLocalizedString(json, 'ko')).toBe('안녕');
    });

    it('falls back to en when requested language not found in JSON', () => {
      const json = JSON.stringify({ en: 'Hello' });
      expect(getSafeLocalizedString(json, 'ja')).toBe('Hello');
    });

    it('returns value from object directly', () => {
      expect(getSafeLocalizedString({ en: 'Hi', ko: '안녕' }, 'ko')).toBe('안녕');
    });

    it('falls back to en for object without matching language', () => {
      expect(getSafeLocalizedString({ en: 'Hi' }, 'ja')).toBe('Hi');
    });

    it('converts non-object/non-string to string', () => {
      expect(getSafeLocalizedString(42, 'en')).toBe('42');
    });
  });

  describe('getProductImage', () => {
    it('returns default image for null/undefined', () => {
      expect(getProductImage(null)).toBe('/images/star-candy/star_100.png');
      expect(getProductImage(undefined)).toBe('/images/star-candy/star_100.png');
    });

    it('returns correct image for exact threshold', () => {
      expect(getProductImage(100)).toBe('/images/star-candy/star_100.png');
      expect(getProductImage(600)).toBe('/images/star-candy/star_600.png');
      expect(getProductImage(10000)).toBe('/images/star-candy/star_10000.png');
    });

    it('returns nearest upper threshold image', () => {
      expect(getProductImage(150)).toBe('/images/star-candy/star_200.png');
      expect(getProductImage(500)).toBe('/images/star-candy/star_600.png');
    });

    it('returns largest image for amounts exceeding max threshold', () => {
      expect(getProductImage(99999)).toBe('/images/star-candy/star_10000.png');
    });
  });

  describe('getSortedProducts', () => {
    it('sorts by web_display_order when both have it', () => {
      const products = [
        { id: 'a', star_candy: 100, web_display_order: 2 },
        { id: 'b', star_candy: 200, web_display_order: 1 },
      ] as any[];
      const sorted = getSortedProducts(products);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('products with web_display_order come first', () => {
      const products = [
        { id: 'a', star_candy: 100, web_display_order: null },
        { id: 'b', star_candy: 200, web_display_order: 1 },
      ] as any[];
      const sorted = getSortedProducts(products);
      expect(sorted[0].id).toBe('b');
    });

    it('sorts by star_candy when no display order', () => {
      const products = [
        { id: 'a', star_candy: 500, web_display_order: null },
        { id: 'b', star_candy: 100, web_display_order: null },
      ] as any[];
      const sorted = getSortedProducts(products);
      expect(sorted[0].id).toBe('b');
      expect(sorted[1].id).toBe('a');
    });

    it('does not mutate original array', () => {
      const products = [
        { id: 'a', star_candy: 500, web_display_order: null },
        { id: 'b', star_candy: 100, web_display_order: null },
      ] as any[];
      getSortedProducts(products);
      expect(products[0].id).toBe('a');
    });
  });

  describe('FEATURED_PRODUCT_AMOUNTS', () => {
    it('contains expected amounts', () => {
      expect(FEATURED_PRODUCT_AMOUNTS).toContain(600);
      expect(FEATURED_PRODUCT_AMOUNTS).toContain(10000);
    });
  });
});

// ============================
// Component tests for StarCandyProductsPresenter
// ============================
vi.mock('@/stores/languageStore', () => ({
  useLanguageStore: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        star_candy_no_products: 'No products available.',
        button_retry: 'Retry',
        star_candy_recharge_title: 'Recharge Star Candy',
        star_candy_recharge_description: 'Choose a package',
        star_candy_unit: 'SC',
        star_candy_bonus: 'Bonus',
        star_candy_no_bonus: 'No bonus',
        star_candy_purchase: 'Purchase',
        star_candy_featured: 'Featured',
        star_candy_notice_title: 'Notice',
        star_candy_notice_1: 'Notice 1',
        star_candy_notice_3: 'Notice 3',
        terms_of_service: 'Terms of Service',
        processing: 'Processing...',
      };
      return map[key] || key;
    },
    currentLanguage: 'en',
  }),
}));

vi.mock('@/lib/supabase/auth-provider', () => ({
  useAuth: () => ({
    user: { id: 'u1' },
    userProfile: { is_admin: true },
    isAuthenticated: true,
    isLoading: false,
    loadUserProfile: vi.fn(),
  }),
}));

vi.mock('@/components/ui/Dialog', () => ({
  useLoginRequired: () => vi.fn(),
  useDialog: () => ({
    showLoginRequired: vi.fn(async () => false),
    showDialog: vi.fn(async () => false),
  }),
}));

vi.mock('@/hooks/useWithdrawalGuard', () => ({
  useWithdrawalGuard: () => vi.fn(async () => false),
}));

vi.mock('@/components/client/star-candy/PaymentMethodSelector', () => ({
  PaymentMethodSelector: ({ onMethodChange }: any) => (
    <div data-testid="payment-selector">Payment Selector</div>
  ),
}));

vi.mock('@/components/common/StarCandyBalanceBox', () => ({
  __esModule: true,
  default: () => <div data-testid="balance-box">Balance</div>,
}));

vi.mock('@/components/client/star-candy/usePaymentPolling', () => ({
  usePaymentPolling: () => ({
    pendingPaymentId: null,
    setPendingPaymentId: vi.fn(),
    isVerifying: false,
    balanceBoxKey: 0,
    setStoredPaymentId: vi.fn(),
  }),
}));

vi.mock('@/components/client/star-candy/usePaymentHandlers', () => ({
  usePaymentHandlers: () => ({
    handlePurchase: vi.fn(),
    getCurrentPrice: (p: any) => p.price || 0,
    getCurrentCurrency: () => 'USD' as const,
    processingProductId: null,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

import { StarCandyProductsPresenter } from '@/components/client/star-candy/StarCandyProductsPresenter';

describe('StarCandyProductsPresenter', () => {
  const mockProducts = [
    {
      id: 'p1',
      star_candy: 100,
      price: 1000,
      web_price_usd: 0.99,
      web_bonus_amount: 10,
      web_description: 'Basic pack',
      web_display_order: 1,
      product_name: 'Basic',
      product_type: 'star_candy',
      platform: 'web',
      rid: 'r1',
      created_at: null,
      description: null,
      end_at: null,
      paypal_link: null,
      star_candy_bonus: null,
      start_at: null,
    },
    {
      id: 'p2',
      star_candy: 600,
      price: 5000,
      web_price_usd: 4.99,
      web_bonus_amount: null,
      web_description: null,
      web_display_order: 2,
      product_name: 'Standard',
      product_type: 'star_candy',
      platform: 'web',
      rid: 'r2',
      created_at: null,
      description: null,
      end_at: null,
      paypal_link: null,
      star_candy_bonus: null,
      start_at: null,
    },
  ] as any[];

  it('renders error state', () => {
    render(<StarCandyProductsPresenter products={[]} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders empty state when no products', () => {
    render(<StarCandyProductsPresenter products={[]} error={null} />);
    expect(screen.getByText('No products available.')).toBeInTheDocument();
  });

  it('renders products', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByText('Recharge Star Candy')).toBeInTheDocument();
    expect(screen.getByText('100 SC')).toBeInTheDocument();
    expect(screen.getByText('600 SC')).toBeInTheDocument();
  });

  it('shows bonus amount when available', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByText('+10 Bonus')).toBeInTheDocument();
  });

  it('shows "No bonus" when bonus is not available', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByText('No bonus')).toBeInTheDocument();
  });

  it('renders Featured badge for eligible products', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('renders payment selector', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByTestId('payment-selector')).toBeInTheDocument();
  });

  it('renders balance box', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByTestId('balance-box')).toBeInTheDocument();
  });

  it('renders notice section', () => {
    render(<StarCandyProductsPresenter products={mockProducts} error={null} />);
    expect(screen.getByText('Notice')).toBeInTheDocument();
  });
});
