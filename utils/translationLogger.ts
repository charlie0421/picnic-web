import { Language } from '@/config/settings';

interface TranslationError {
  key: string;
  language: Language;
  timestamp: number;
  context?: string;
  fallbackUsed?: string;
}

interface TranslationLoggerConfig {
  enableConsoleLogging: boolean;
  enableRemoteLogging: boolean;
  maxLocalErrors: number;
  reportingEndpoint?: string;
}

class TranslationLogger {
  private config: TranslationLoggerConfig;
  private errorCache: Map<string, TranslationError> = new Map();
  private reportedErrors: Set<string> = new Set();
  private reportingQueue: TranslationError[] = [];

  constructor(config: Partial<TranslationLoggerConfig> = {}) {
    this.config = {
      enableConsoleLogging: process.env.NODE_ENV === 'development',
      enableRemoteLogging: process.env.NODE_ENV === 'production',
      maxLocalErrors: 100,
      reportingEndpoint: '/api/translations/report-missing',
      ...config,
    };
  }

  /**
   * 번역 키가 누락된 경우 로깅
   */
  logMissingTranslation(
    key: string,
    language: Language,
    context?: string,
    fallbackUsed?: string
  ): void {
    const errorId = `${key}-${language}`;
    
    // 이미 보고된 에러는 중복 로깅 방지
    if (this.reportedErrors.has(errorId)) {
      return;
    }

    const error: TranslationError = {
      key,
      language,
      timestamp: Date.now(),
      context,
      fallbackUsed,
    };

    // 로컬 캐시에 저장
    this.errorCache.set(errorId, error);
    this.reportedErrors.add(errorId);

    // 콘솔 로깅 (개발 환경)
    if (this.config.enableConsoleLogging) {
      console.warn(
        `🔍 [Translation] Missing key: "${key}" for language: ${language}`,
        context ? `(context: ${context})` : '',
        fallbackUsed ? `(fallback: "${fallbackUsed}")` : ''
      );
    }

    // 원격 보고 큐에 추가
    if (this.config.enableRemoteLogging) {
      this.reportingQueue.push(error);
      this.scheduleReporting();
    }

    // 캐시 크기 제한
    if (this.errorCache.size > this.config.maxLocalErrors) {
      const oldestKey = this.errorCache.keys().next().value;
      this.errorCache.delete(oldestKey);
    }
  }

  /**
   * 번역 로딩 에러 로깅
   */
  logLoadingError(language: Language, error: Error, source: 'local' | 'crowdin'): void {
    const errorMessage = `Failed to load ${source} translations for ${language}: ${error.message}`;
    
    if (this.config.enableConsoleLogging) {
      console.error(`❌ [Translation] ${errorMessage}`, error);
    }

    // 원격 보고
    if (this.config.enableRemoteLogging) {
      this.reportingQueue.push({
        key: `__LOADING_ERROR__`,
        language,
        timestamp: Date.now(),
        context: `${source}_loading_error: ${error.message}`,
      });
      this.scheduleReporting();
    }
  }

  /**
   * 번역 성공 로깅 (통계용)
   */
  logTranslationSuccess(language: Language, keysLoaded: number, source: 'local' | 'crowdin'): void {
    if (this.config.enableConsoleLogging) {
      console.log(`✅ [Translation] Loaded ${keysLoaded} keys for ${language} from ${source}`);
    }
  }

  /**
   * 언어 동기화 이벤트 로깅
   */
  logLanguageSync(fromLanguage: Language, toLanguage: Language, trigger: string): void {
    if (this.config.enableConsoleLogging) {
      console.log(`🔄 [Translation] Language sync: ${fromLanguage} → ${toLanguage} (${trigger})`);
    }
  }

  /**
   * 누락된 번역 키 통계 반환
   */
  getMissingTranslationStats(): {
    totalMissing: number;
    byLanguage: Record<Language, number>;
    recentErrors: TranslationError[];
  } {
    const byLanguage = {} as Record<Language, number>;
    const recentErrors: TranslationError[] = [];
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    for (const error of this.errorCache.values()) {
      // 언어별 통계
      byLanguage[error.language] = (byLanguage[error.language] || 0) + 1;
      
      // 최근 1시간 에러
      if (error.timestamp > oneHourAgo) {
        recentErrors.push(error);
      }
    }

    return {
      totalMissing: this.errorCache.size,
      byLanguage,
      recentErrors: recentErrors.sort((a, b) => b.timestamp - a.timestamp),
    };
  }

  /**
   * 에러 캐시 초기화
   */
  clearErrorCache(): void {
    this.errorCache.clear();
    this.reportedErrors.clear();
    this.reportingQueue.length = 0;
  }

  /**
   * 원격 보고 스케줄링 (배치 처리)
   */
  private scheduleReporting(): void {
    // 이미 스케줄된 보고가 있으면 무시
    if (this.reportingQueue.length === 0) return;

    // 5초 후 배치 보고
    setTimeout(() => {
      this.sendErrorReport();
    }, 5000);
  }

  /**
   * 원격 서버로 에러 보고 전송
   */
  private async sendErrorReport(): Promise<void> {
    if (this.reportingQueue.length === 0 || !this.config.reportingEndpoint) return;

    const errorsToReport = [...this.reportingQueue];
    this.reportingQueue.length = 0;

    try {
      const response = await fetch(this.config.reportingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          errors: errorsToReport,
          userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server',
          url: typeof window !== 'undefined' ? window.location.href : 'server',
          timestamp: Date.now(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (this.config.enableConsoleLogging) {
        console.log(`📤 [Translation] Reported ${errorsToReport.length} translation errors`);
      }
    } catch (error) {
      // 보고 실패 시 다시 큐에 추가 (최대 3회 재시도)
      const retriableErrors = errorsToReport.filter(err => 
        !err.context?.includes('retry_count') || 
        parseInt(err.context.split('retry_count:')[1] || '0') < 3
      );

      retriableErrors.forEach(err => {
        const retryCount = parseInt(err.context?.split('retry_count:')[1] || '0') + 1;
        err.context = `${err.context || ''} retry_count:${retryCount}`;
        this.reportingQueue.push(err);
      });

      if (this.config.enableConsoleLogging) {
        console.error('❌ [Translation] Failed to report errors:', error);
      }
    }
  }
}

// 싱글톤 인스턴스 생성
export const translationLogger = new TranslationLogger();

// 개발 환경에서 전역 접근 가능하도록 설정
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).translationLogger = translationLogger;
} 