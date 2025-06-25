import type { Currency } from '../types';

/**
 * 통화별 설정 정보
 */
interface CurrencyConfig {
  /** 통화 심볼 */
  symbol: string;
  /** 통화 코드 */
  code: Currency;
  /** 소수점 자릿수 */
  decimals: number;
  /** 천 단위 구분자 */
  thousandsSeparator: string;
  /** 소수점 구분자 */
  decimalSeparator: string;
  /** 심볼 위치 (앞/뒤) */
  symbolPosition: 'before' | 'after';
  /** 심볼과 숫자 사이 공백 여부 */
  spaceAfterSymbol: boolean;
  /** 로케일 코드 */
  locale: string;
  /** 통화 이름 */
  name: string;
  /** 통화 이름 (한국어) */
  nameKo: string;
}

/**
 * 지원되는 통화 설정
 */
export const CURRENCY_CONFIGS: Record<Currency, CurrencyConfig> = {
  KRW: {
    symbol: '₩',
    code: 'KRW',
    decimals: 0,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    symbolPosition: 'before',
    spaceAfterSymbol: false,
    locale: 'ko-KR',
    name: 'Korean Won',
    nameKo: '원'
  },
  USD: {
    symbol: '$',
    code: 'USD',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    symbolPosition: 'before',
    spaceAfterSymbol: false,
    locale: 'en-US',
    name: 'US Dollar',
    nameKo: '달러'
  },
  EUR: {
    symbol: '€',
    code: 'EUR',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    symbolPosition: 'after',
    spaceAfterSymbol: true,
    locale: 'de-DE',
    name: 'Euro',
    nameKo: '유로'
  },
  GBP: {
    symbol: '£',
    code: 'GBP',
    decimals: 2,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    symbolPosition: 'before',
    spaceAfterSymbol: false,
    locale: 'en-GB',
    name: 'British Pound',
    nameKo: '파운드'
  },
  JPY: {
    symbol: '¥',
    code: 'JPY',
    decimals: 0,
    thousandsSeparator: ',',
    decimalSeparator: '.',
    symbolPosition: 'before',
    spaceAfterSymbol: false,
    locale: 'ja-JP',
    name: 'Japanese Yen',
    nameKo: '엔'
  }
};

/**
 * 포맷팅 옵션
 */
export interface FormatCurrencyOptions {
  /** 소수점 표시 여부 (기본값: 통화 설정 따름) */
  showDecimals?: boolean;
  /** 천 단위 구분자 표시 여부 */
  showThousandsSeparator?: boolean;
  /** 통화 심볼 표시 여부 */
  showSymbol?: boolean;
  /** 통화 코드 표시 여부 */
  showCurrencyCode?: boolean;
  /** 압축 표시 (K, M 등) */
  compact?: boolean;
  /** 최소 소수점 자릿수 */
  minimumFractionDigits?: number;
  /** 최대 소수점 자릿수 */
  maximumFractionDigits?: number;
}

/**
 * 숫자를 통화 형식으로 포맷팅
 */
export function formatCurrency(
  amount: number,
  currency: Currency,
  options: FormatCurrencyOptions = {}
): string {
  const config = CURRENCY_CONFIGS[currency];
  
  if (!config) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const {
    showDecimals = true,
    showThousandsSeparator = true,
    showSymbol = true,
    showCurrencyCode = false,
    compact = false,
    minimumFractionDigits,
    maximumFractionDigits
  } = options;

  // 압축 표시 처리
  if (compact) {
    return formatCompactCurrency(amount, currency, options);
  }

  // 소수점 자릿수 결정
  const decimals = showDecimals ? config.decimals : 0;
  const minDecimals = minimumFractionDigits ?? (showDecimals ? config.decimals : 0);
  const maxDecimals = maximumFractionDigits ?? decimals;

  // Intl.NumberFormat을 사용한 기본 포맷팅
  const formatter = new Intl.NumberFormat(config.locale, {
    style: 'currency',
    currency: config.code,
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
    useGrouping: showThousandsSeparator
  });

  let formatted = formatter.format(amount);

  // 심볼이나 코드 표시 조정
  if (!showSymbol && !showCurrencyCode) {
    // 심볼과 코드 모두 제거
    formatted = formatted.replace(/[₩$€£¥]|\s*[A-Z]{3}\s*/g, '').trim();
  } else if (!showSymbol && showCurrencyCode) {
    // 심볼 제거하고 코드 추가
    formatted = formatted.replace(/[₩$€£¥]/g, '').trim();
    formatted = `${formatted} ${config.code}`;
  } else if (showSymbol && showCurrencyCode) {
    // 심볼과 코드 모두 표시
    formatted = `${formatted} ${config.code}`;
  }

  return formatted;
}

/**
 * 압축된 통화 형식으로 포맷팅 (1K, 1M 등)
 */
export function formatCompactCurrency(
  amount: number,
  currency: Currency,
  options: FormatCurrencyOptions = {}
): string {
  const config = CURRENCY_CONFIGS[currency];
  const { showSymbol = true, showCurrencyCode = false } = options;

  let compactAmount: number;
  let suffix: string;

  if (Math.abs(amount) >= 1000000000) {
    compactAmount = amount / 1000000000;
    suffix = 'B';
  } else if (Math.abs(amount) >= 1000000) {
    compactAmount = amount / 1000000;
    suffix = 'M';
  } else if (Math.abs(amount) >= 1000) {
    compactAmount = amount / 1000;
    suffix = 'K';
  } else {
    compactAmount = amount;
    suffix = '';
  }

  // 소수점 1자리까지만 표시
  const rounded = Math.round(compactAmount * 10) / 10;
  const numberStr = rounded % 1 === 0 ? rounded.toString() : rounded.toFixed(1);

  let result = `${numberStr}${suffix}`;

  // 심볼 추가
  if (showSymbol) {
    if (config.symbolPosition === 'before') {
      result = `${config.symbol}${config.spaceAfterSymbol ? ' ' : ''}${result}`;
    } else {
      result = `${result}${config.spaceAfterSymbol ? ' ' : ''}${config.symbol}`;
    }
  }

  // 통화 코드 추가
  if (showCurrencyCode) {
    result = `${result} ${config.code}`;
  }

  return result;
}

/**
 * 통화 심볼만 반환
 */
export function getCurrencySymbol(currency: Currency): string {
  const config = CURRENCY_CONFIGS[currency];
  return config?.symbol || currency;
}

/**
 * 통화 이름 반환
 */
export function getCurrencyName(currency: Currency, locale: 'en' | 'ko' = 'en'): string {
  const config = CURRENCY_CONFIGS[currency];
  if (!config) return currency;
  
  return locale === 'ko' ? config.nameKo : config.name;
}

/**
 * 통화 설정 반환
 */
export function getCurrencyConfig(currency: Currency): CurrencyConfig | null {
  return CURRENCY_CONFIGS[currency] || null;
}

/**
 * 금액 범위 포맷팅 (예: $10 - $50)
 */
export function formatCurrencyRange(
  minAmount: number,
  maxAmount: number,
  currency: Currency,
  options: FormatCurrencyOptions = {}
): string {
  const minFormatted = formatCurrency(minAmount, currency, options);
  const maxFormatted = formatCurrency(maxAmount, currency, options);
  
  return `${minFormatted} - ${maxFormatted}`;
}

/**
 * 퍼센트 포맷팅
 */
export function formatPercentage(
  value: number,
  decimals: number = 1
): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * 수수료 계산 및 포맷팅
 */
export interface FeeCalculation {
  baseAmount: number;
  feeRate: number;
  fixedFee?: number;
  feeAmount: number;
  totalAmount: number;
  currency: Currency;
}

/**
 * 수수료 계산
 */
export function calculateFee(
  baseAmount: number,
  feeRate: number,
  currency: Currency,
  fixedFee: number = 0
): FeeCalculation {
  const feeAmount = (baseAmount * feeRate) / 100 + fixedFee;
  const totalAmount = baseAmount + feeAmount;

  return {
    baseAmount,
    feeRate,
    fixedFee: fixedFee > 0 ? fixedFee : undefined,
    feeAmount,
    totalAmount,
    currency
  };
}

/**
 * 수수료 계산 결과를 포맷팅된 문자열로 변환
 */
export function formatFeeCalculation(
  calculation: FeeCalculation,
  options: FormatCurrencyOptions = {}
): {
  baseAmount: string;
  feeAmount: string;
  totalAmount: string;
  feeRate: string;
  fixedFee?: string;
} {
  const { currency, baseAmount, feeAmount, totalAmount, feeRate, fixedFee } = calculation;

  return {
    baseAmount: formatCurrency(baseAmount, currency, options),
    feeAmount: formatCurrency(feeAmount, currency, options),
    totalAmount: formatCurrency(totalAmount, currency, options),
    feeRate: formatPercentage(feeRate),
    fixedFee: fixedFee ? formatCurrency(fixedFee, currency, options) : undefined
  };
}

/**
 * 환율 변환 (간단한 예시 - 실제로는 API에서 가져와야 함)
 */
export interface ExchangeRate {
  from: Currency;
  to: Currency;
  rate: number;
  lastUpdated: Date;
}

/**
 * 금액을 다른 통화로 변환
 */
export function convertCurrency(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  exchangeRate: number
): number {
  if (fromCurrency === toCurrency) return amount;
  return amount * exchangeRate;
}

/**
 * 환율 정보와 함께 통화 변환 표시
 */
export function formatCurrencyConversion(
  amount: number,
  fromCurrency: Currency,
  toCurrency: Currency,
  exchangeRate: number,
  options: FormatCurrencyOptions = {}
): string {
  const originalAmount = formatCurrency(amount, fromCurrency, options);
  const convertedAmount = convertCurrency(amount, fromCurrency, toCurrency, exchangeRate);
  const convertedFormatted = formatCurrency(convertedAmount, toCurrency, options);
  
  return `${originalAmount} ≈ ${convertedFormatted}`;
}