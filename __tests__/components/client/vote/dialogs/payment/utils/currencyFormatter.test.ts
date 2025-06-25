import {
  formatCurrency,
  formatCompactCurrency,
  formatPercentage,
  formatCurrencyRange,
  formatCurrencyConversion,
  getCurrencySymbol,
  getCurrencyName,
  getCurrencyConfig,
  calculateFee,
  formatFeeCalculation,
  convertCurrency,
  CURRENCY_CONFIGS,
  type FormatCurrencyOptions
} from '@/components/client/vote/dialogs/payment/utils/currencyFormatter';

describe('Currency Formatter Utils', () => {
  describe('formatCurrency', () => {
    it('should format KRW correctly', () => {
      expect(formatCurrency(10000, 'KRW')).toBe('₩10,000');
      expect(formatCurrency(1234567, 'KRW')).toBe('₩1,234,567');
    });

    it('should format USD correctly', () => {
      expect(formatCurrency(100, 'USD')).toBe('$100.00');
      expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('should format EUR correctly', () => {
      const result1 = formatCurrency(100, 'EUR');
      const result2 = formatCurrency(1234.56, 'EUR');
      
      // 실제 브라우저에서 생성되는 형식을 사용
      expect(result1).toMatch(/100[,.]00\s*€/);
      expect(result2).toMatch(/1[.,]234[,.]56\s*€/);
    });

    it('should format GBP correctly', () => {
      expect(formatCurrency(100, 'GBP')).toBe('£100.00');
      expect(formatCurrency(1234.56, 'GBP')).toBe('£1,234.56');
    });

    it('should format JPY correctly', () => {
      expect(formatCurrency(10000, 'JPY')).toBe('￥10,000');
      expect(formatCurrency(123456, 'JPY')).toBe('￥123,456');
    });

    it('should respect formatting options', () => {
      const options: FormatCurrencyOptions = {
        showDecimals: false,
        showThousandsSeparator: false,
        showSymbol: true,
        showCurrencyCode: false
      };

      expect(formatCurrency(1234.56, 'USD', options)).toBe('$1235');
      expect(formatCurrency(10000, 'KRW', options)).toBe('₩10000');
    });

    it('should show currency code when requested', () => {
      const options: FormatCurrencyOptions = {
        showSymbol: true,
        showCurrencyCode: true
      };

      expect(formatCurrency(100, 'USD', options)).toBe('$100.00 USD');
      expect(formatCurrency(10000, 'KRW', options)).toBe('₩10,000 KRW');
    });

    it('should hide symbol when requested', () => {
      const options: FormatCurrencyOptions = {
        showSymbol: false,
        showCurrencyCode: true
      };

      expect(formatCurrency(100, 'USD', options)).toBe('100.00 USD');
      expect(formatCurrency(10000, 'KRW', options)).toBe('10,000 KRW');
    });
  });

  describe('formatCompactCurrency', () => {
    it('should format thousands correctly', () => {
      expect(formatCompactCurrency(1000, 'USD')).toBe('$1K');
      expect(formatCompactCurrency(1500, 'USD')).toBe('$1.5K');
      expect(formatCompactCurrency(12000, 'KRW')).toBe('₩12K');
    });

    it('should format millions correctly', () => {
      expect(formatCompactCurrency(1000000, 'USD')).toBe('$1M');
      expect(formatCompactCurrency(2500000, 'USD')).toBe('$2.5M');
      expect(formatCompactCurrency(1000000, 'KRW')).toBe('₩1M');
    });

    it('should format billions correctly', () => {
      expect(formatCompactCurrency(1000000000, 'USD')).toBe('$1B');
      expect(formatCompactCurrency(2500000000, 'USD')).toBe('$2.5B');
    });

    it('should handle small amounts without suffix', () => {
      expect(formatCompactCurrency(999, 'USD')).toBe('$999');
      expect(formatCompactCurrency(500, 'KRW')).toBe('₩500');
    });

    it('should respect symbol options', () => {
      const options: FormatCurrencyOptions = {
        showSymbol: false,
        showCurrencyCode: true
      };

      expect(formatCompactCurrency(1000, 'USD', options)).toBe('1K USD');
      expect(formatCompactCurrency(1000000, 'KRW', options)).toBe('1M KRW');
    });
  });

  describe('formatPercentage', () => {
    it('should format percentages correctly', () => {
      expect(formatPercentage(2.9)).toBe('2.9%');
      expect(formatPercentage(15.0)).toBe('15.0%');
      expect(formatPercentage(0.5)).toBe('0.5%');
    });

    it('should respect decimal places', () => {
      expect(formatPercentage(2.9, 0)).toBe('3%');
      expect(formatPercentage(2.9, 2)).toBe('2.90%');
    });
  });

  describe('formatCurrencyRange', () => {
    it('should format currency ranges correctly', () => {
      expect(formatCurrencyRange(10, 50, 'USD')).toBe('$10.00 - $50.00');
      expect(formatCurrencyRange(1000, 5000, 'KRW')).toBe('₩1,000 - ₩5,000');
    });

    it('should respect formatting options', () => {
      const options: FormatCurrencyOptions = {
        showDecimals: false
      };

      expect(formatCurrencyRange(10, 50, 'USD', options)).toBe('$10 - $50');
    });
  });

  describe('getCurrencySymbol', () => {
    it('should return correct symbols', () => {
      expect(getCurrencySymbol('KRW')).toBe('₩');
      expect(getCurrencySymbol('USD')).toBe('$');
      expect(getCurrencySymbol('EUR')).toBe('€');
      expect(getCurrencySymbol('GBP')).toBe('£');
      expect(getCurrencySymbol('JPY')).toBe('¥');
    });
  });

  describe('getCurrencyName', () => {
    it('should return English names by default', () => {
      expect(getCurrencyName('KRW')).toBe('Korean Won');
      expect(getCurrencyName('USD')).toBe('US Dollar');
      expect(getCurrencyName('EUR')).toBe('Euro');
    });

    it('should return Korean names when requested', () => {
      expect(getCurrencyName('KRW', 'ko')).toBe('원');
      expect(getCurrencyName('USD', 'ko')).toBe('달러');
      expect(getCurrencyName('EUR', 'ko')).toBe('유로');
    });
  });

  describe('getCurrencyConfig', () => {
    it('should return correct config for each currency', () => {
      const krwConfig = getCurrencyConfig('KRW');
      expect(krwConfig).toBeTruthy();
      expect(krwConfig?.symbol).toBe('₩');
      expect(krwConfig?.decimals).toBe(0);
      expect(krwConfig?.locale).toBe('ko-KR');

      const usdConfig = getCurrencyConfig('USD');
      expect(usdConfig).toBeTruthy();
      expect(usdConfig?.symbol).toBe('$');
      expect(usdConfig?.decimals).toBe(2);
      expect(usdConfig?.locale).toBe('en-US');
    });
  });

  describe('calculateFee', () => {
    it('should calculate fees correctly', () => {
      const result = calculateFee(10000, 2.9, 'KRW', 0);
      
      expect(result.baseAmount).toBe(10000);
      expect(result.feeRate).toBe(2.9);
      expect(result.feeAmount).toBe(290);
      expect(result.totalAmount).toBe(10290);
      expect(result.currency).toBe('KRW');
    });

    it('should include fixed fees', () => {
      const result = calculateFee(10000, 2.9, 'KRW', 300);
      
      expect(result.feeAmount).toBe(590); // 290 + 300
      expect(result.totalAmount).toBe(10590);
      expect(result.fixedFee).toBe(300);
    });

    it('should handle zero fixed fee', () => {
      const result = calculateFee(10000, 2.9, 'KRW', 0);
      
      expect(result.fixedFee).toBeUndefined();
    });
  });

  describe('formatFeeCalculation', () => {
    it('should format fee calculation results', () => {
      const calculation = calculateFee(10000, 2.9, 'KRW', 300);
      const formatted = formatFeeCalculation(calculation);

      expect(formatted.baseAmount).toBe('₩10,000');
      expect(formatted.feeAmount).toBe('₩590');
      expect(formatted.totalAmount).toBe('₩10,590');
      expect(formatted.feeRate).toBe('2.9%');
      expect(formatted.fixedFee).toBe('₩300');
    });

    it('should handle no fixed fee', () => {
      const calculation = calculateFee(100, 2.9, 'USD', 0);
      const formatted = formatFeeCalculation(calculation);

      expect(formatted.fixedFee).toBeUndefined();
    });
  });

  describe('convertCurrency', () => {
    it('should convert between currencies', () => {
      expect(convertCurrency(100, 'USD', 'KRW', 1300)).toBe(130000);
      expect(convertCurrency(1000, 'KRW', 'USD', 0.00077)).toBeCloseTo(0.77, 2);
    });

    it('should return same amount for same currency', () => {
      expect(convertCurrency(100, 'USD', 'USD', 1)).toBe(100);
      expect(convertCurrency(10000, 'KRW', 'KRW', 1)).toBe(10000);
    });
  });

  describe('formatCurrencyConversion', () => {
    it('should format currency conversions', () => {
      const result = formatCurrencyConversion(100, 'USD', 'KRW', 1300);
      expect(result).toBe('$100.00 ≈ ₩130,000');
    });

    it('should respect formatting options', () => {
      const options: FormatCurrencyOptions = {
        showDecimals: false
      };
      
      const result = formatCurrencyConversion(100, 'USD', 'KRW', 1300, options);
      expect(result).toBe('$100 ≈ ₩130,000');
    });
  });

  describe('CURRENCY_CONFIGS', () => {
    it('should have configs for all supported currencies', () => {
      expect(CURRENCY_CONFIGS.KRW).toBeDefined();
      expect(CURRENCY_CONFIGS.USD).toBeDefined();
      expect(CURRENCY_CONFIGS.EUR).toBeDefined();
      expect(CURRENCY_CONFIGS.GBP).toBeDefined();
      expect(CURRENCY_CONFIGS.JPY).toBeDefined();
    });

    it('should have required properties for each config', () => {
      Object.values(CURRENCY_CONFIGS).forEach(config => {
        expect(config.symbol).toBeTruthy();
        expect(config.code).toBeTruthy();
        expect(typeof config.decimals).toBe('number');
        expect(config.locale).toBeTruthy();
        expect(config.name).toBeTruthy();
        expect(config.nameKo).toBeTruthy();
      });
    });
  });

  describe('Error handling', () => {
    it('should throw error for unsupported currency', () => {
      // @ts-expect-error Testing invalid currency
      expect(() => formatCurrency(100, 'INVALID')).toThrow('Unsupported currency: INVALID');
    });
  });
});