// =====================================================================================
// PAYMENT SESSION MANAGEMENT SERVICE
// =====================================================================================
// 결제 세션의 생성, 관리, 검증, 타임아웃 처리 및 복구를 담당하는 서비스
// Port One과 PayPal 결제 시스템에서 공통으로 사용되는 세션 관리 기능 제공
// =====================================================================================

import type { 
  Region, 
  PaymentProvider, 
  PaymentStatus,
  Currency,
  PaymentSession,
  PaymentReceipt,
  ProductType
} from '@/components/client/vote/dialogs/payment/types';

/**
 * 세션 저장소 인터페이스 (다양한 저장소 구현 지원)
 */
export interface SessionStorage {
  get(sessionId: string): Promise<PaymentSessionData | null>;
  set(sessionId: string, data: PaymentSessionData, ttl?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
  exists(sessionId: string): Promise<boolean>;
  extend(sessionId: string, ttl: number): Promise<void>;
  cleanup(): Promise<number>; // 만료된 세션 정리, 정리된 개수 반환
}

/**
 * 결제 세션 데이터 구조
 */
export interface PaymentSessionData {
  // 기본 정보
  id: string;                           // 세션 ID
  userId: string;                       // 사용자 ID
  createdAt: number;                    // 생성 시간 (timestamp)
  updatedAt: number;                    // 업데이트 시간 (timestamp)
  expiresAt: number;                    // 만료 시간 (timestamp)
  
  // 결제 정보
  provider: PaymentProvider;            // 결제 제공업체
  region: Region;                       // 결제 지역
  currency: Currency;                   // 통화
  amount: number;                       // 결제 금액
  
  // 상품 정보
  product: ProductType;                 // 결제 상품
  
  // 상태 정보
  status: PaymentSessionStatus;         // 세션 상태
  paymentStatus: PaymentStatus;         // 결제 상태
  attempts: number;                     // 시도 횟수
  lastActivity: number;                 // 마지막 활동 시간
  
  // 외부 결제 시스템 정보
  externalTransactionId?: string;       // 외부 거래 ID (Port One/PayPal)
  externalSessionId?: string;           // 외부 세션 ID
  
  // 메타데이터
  metadata: {
    userAgent: string;                  // 사용자 에이전트
    ipAddress?: string;                 // IP 주소
    fingerprint?: string;               // 디바이스 지문
    source: string;                     // 유입 경로
    version: string;                    // 세션 스키마 버전
  };
  
  // 보안 정보
  security: {
    token: string;                      // 세션 토큰 (검증용)
    checksum: string;                   // 데이터 무결성 체크섬
    encrypted: boolean;                 // 암호화 여부
  };
  
  // 복구 정보
  recovery?: {
    previousSessionId?: string;         // 이전 세션 ID
    recoveryToken?: string;             // 복구 토큰
    recoveryAttempts: number;           // 복구 시도 횟수
    lastRecoveryAt?: number;            // 마지막 복구 시도 시간
  };
}

/**
 * 결제 세션 상태
 */
export type PaymentSessionStatus = 
  | 'created'       // 생성됨
  | 'initialized'   // 초기화됨
  | 'active'        // 활성
  | 'processing'    // 처리 중
  | 'completed'     // 완료
  | 'failed'        // 실패
  | 'expired'       // 만료
  | 'cancelled'     // 취소
  | 'recovered';    // 복구됨

/**
 * 세션 생성 옵션
 */
export interface CreateSessionOptions {
  userId: string;
  provider: PaymentProvider;
  region: Region;
  currency: Currency;
  amount: number;
  product: ProductType;
  metadata?: Partial<PaymentSessionData['metadata']>;
  ttl?: number;                         // Time to live in seconds (기본: 30분)
}

/**
 * 세션 검증 결과
 */
export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  remainingTime?: number;               // 남은 시간 (초)
  recommendations?: string[];           // 권장 사항
}

/**
 * 세션 복구 옵션
 */
export interface SessionRecoveryOptions {
  maxAttempts?: number;                 // 최대 복구 시도 횟수
  allowPartialData?: boolean;           // 부분 데이터 복구 허용
  createNew?: boolean;                  // 복구 실패 시 새 세션 생성
}

/**
 * Payment Session 에러 클래스
 */
export class PaymentSessionError extends Error {
  constructor(
    message: string,
    public code: string,
    public sessionId?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PaymentSessionError';
  }
}

/**
 * 메모리 기반 세션 저장소 (개발/테스트용)
 */
class MemorySessionStorage implements SessionStorage {
  private sessions = new Map<string, { data: PaymentSessionData; expires: number }>();

  async get(sessionId: string): Promise<PaymentSessionData | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.sessions.delete(sessionId);
      return null;
    }
    
    return entry.data;
  }

  async set(sessionId: string, data: PaymentSessionData, ttl = 1800): Promise<void> {
    const expires = Date.now() + (ttl * 1000);
    this.sessions.set(sessionId, { data, expires });
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  async extend(sessionId: string, ttl: number): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (entry) {
      entry.expires = Date.now() + (ttl * 1000);
    }
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    const sessionsToDelete: string[] = [];
    
    this.sessions.forEach((entry, sessionId) => {
      if (now > entry.expires) {
        sessionsToDelete.push(sessionId);
      }
    });
    
    sessionsToDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
      cleaned++;
    });
    
    return cleaned;
  }
}

/**
 * Payment Session Management 서비스
 */
export class PaymentSessionService {
  private storage: SessionStorage;
  private config: {
    defaultTTL: number;                 // 기본 세션 만료 시간 (초)
    maxAttempts: number;                // 최대 시도 횟수
    cleanupInterval: number;            // 정리 주기 (밀리초)
    enableRecovery: boolean;            // 복구 기능 활성화
    enableEncryption: boolean;          // 암호화 활성화
  };
  private cleanupTimer?: NodeJS.Timeout;

  constructor(storage?: SessionStorage, config?: Partial<PaymentSessionService['config']>) {
    this.storage = storage || new MemorySessionStorage();
    this.config = {
      defaultTTL: 1800,                 // 30분
      maxAttempts: 3,
      cleanupInterval: 300000,          // 5분
      enableRecovery: true,
      enableEncryption: false,          // 개발 단계에서는 비활성화
      ...config
    };

    // 자동 정리 시작
    this.startCleanup();
  }

  /**
   * 새 결제 세션 생성
   */
  async createSession(options: CreateSessionOptions): Promise<PaymentSessionData> {
    try {
      const sessionId = this.generateSessionId();
      const now = Date.now();
      const ttl = options.ttl || this.config.defaultTTL;
      
      const sessionData: PaymentSessionData = {
        id: sessionId,
        userId: options.userId,
        createdAt: now,
        updatedAt: now,
        expiresAt: now + (ttl * 1000),
        
        provider: options.provider,
        region: options.region,
        currency: options.currency,
        amount: options.amount,
        product: options.product,
        
        status: 'created',
        paymentStatus: 'idle',
        attempts: 0,
        lastActivity: now,
        
        metadata: {
          userAgent: options.metadata?.userAgent || 'Unknown',
          ipAddress: options.metadata?.ipAddress,
          fingerprint: options.metadata?.fingerprint,
          source: options.metadata?.source || 'direct',
          version: '1.0.0'
        },
        
        security: {
          token: this.generateSecurityToken(),
          checksum: '',
          encrypted: this.config.enableEncryption
        }
      };

      // 체크섬 생성
      sessionData.security.checksum = this.generateChecksum(sessionData);

      // 저장
      await this.storage.set(sessionId, sessionData, ttl);

      return sessionData;
    } catch (error) {
      throw new PaymentSessionError(
        `Failed to create payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_CREATION_FAILED',
        undefined,
        error
      );
    }
  }

  /**
   * 세션 조회
   */
  async getSession(sessionId: string): Promise<PaymentSessionData | null> {
    try {
      const session = await this.storage.get(sessionId);
      
      if (session) {
        // 체크섬 검증
        const expectedChecksum = this.generateChecksum(session);
        if (session.security.checksum !== expectedChecksum) {
          throw new PaymentSessionError(
            'Session data integrity check failed',
            'INTEGRITY_CHECK_FAILED',
            sessionId
          );
        }
        
        // 만료 확인
        if (Date.now() > session.expiresAt) {
          await this.storage.delete(sessionId);
          return null;
        }
        
        // 마지막 활동 시간 업데이트
        session.lastActivity = Date.now();
        await this.updateSession(sessionId, session);
      }
      
      return session;
    } catch (error) {
      if (error instanceof PaymentSessionError) {
        throw error;
      }
      
      throw new PaymentSessionError(
        `Failed to get payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_RETRIEVAL_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * 세션 업데이트
   */
  async updateSession(sessionId: string, updates: Partial<PaymentSessionData>): Promise<PaymentSessionData> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new PaymentSessionError(
          'Session not found',
          'SESSION_NOT_FOUND',
          sessionId
        );
      }

      const updatedSession = {
        ...session,
        ...updates,
        id: sessionId, // ID는 변경 불가
        updatedAt: Date.now()
      };

      // 체크섬 재생성
      updatedSession.security.checksum = this.generateChecksum(updatedSession);

      await this.storage.set(sessionId, updatedSession);
      return updatedSession;
    } catch (error) {
      if (error instanceof PaymentSessionError) {
        throw error;
      }
      
      throw new PaymentSessionError(
        `Failed to update payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_UPDATE_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * 세션 검증
   */
  async validateSession(sessionId: string, token?: string): Promise<SessionValidationResult> {
    try {
      const session = await this.getSession(sessionId);
      
      if (!session) {
        return {
          valid: false,
          reason: 'Session not found'
        };
      }

      // 토큰 검증
      if (token && session.security.token !== token) {
        return {
          valid: false,
          reason: 'Invalid security token'
        };
      }

      // 만료 확인
      const now = Date.now();
      if (now > session.expiresAt) {
        return {
          valid: false,
          reason: 'Session expired'
        };
      }

      // 최대 시도 횟수 확인
      if (session.attempts >= this.config.maxAttempts) {
        return {
          valid: false,
          reason: 'Maximum attempts exceeded',
          recommendations: ['Create a new session']
        };
      }

      // 상태 확인
      if (session.status === 'completed' || session.status === 'cancelled') {
        return {
          valid: false,
          reason: `Session is ${session.status}`,
          recommendations: ['Create a new session for a new payment']
        };
      }

      const remainingTime = Math.floor((session.expiresAt - now) / 1000);
      const recommendations: string[] = [];

      if (remainingTime < 300) { // 5분 미만
        recommendations.push('Session expires soon, consider extending it');
      }

      return {
        valid: true,
        remainingTime,
        recommendations: recommendations.length > 0 ? recommendations : undefined
      };
    } catch (error) {
      return {
        valid: false,
        reason: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  /**
   * 세션 만료 시간 연장
   */
  async extendSession(sessionId: string, additionalTTL: number = 1800): Promise<PaymentSessionData> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new PaymentSessionError(
          'Session not found',
          'SESSION_NOT_FOUND',
          sessionId
        );
      }

      const newExpiresAt = session.expiresAt + (additionalTTL * 1000);
      const updatedSession = await this.updateSession(sessionId, {
        expiresAt: newExpiresAt
      });

      await this.storage.extend(sessionId, additionalTTL);
      return updatedSession;
    } catch (error) {
      if (error instanceof PaymentSessionError) {
        throw error;
      }
      
      throw new PaymentSessionError(
        `Failed to extend payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_EXTENSION_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * 세션 삭제
   */
  async deleteSession(sessionId: string): Promise<void> {
    try {
      await this.storage.delete(sessionId);
    } catch (error) {
      throw new PaymentSessionError(
        `Failed to delete payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_DELETION_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * 세션 복구 시도
   */
  async recoverSession(sessionId: string, options: SessionRecoveryOptions = {}): Promise<PaymentSessionData | null> {
    if (!this.config.enableRecovery) {
      throw new PaymentSessionError(
        'Session recovery is disabled',
        'RECOVERY_DISABLED',
        sessionId
      );
    }

    try {
      // 복구 시도 (이 예제에서는 간단한 구현)
      const session = await this.storage.get(sessionId);
      
      if (session && session.recovery) {
        session.recovery.recoveryAttempts++;
        session.recovery.lastRecoveryAt = Date.now();
        
        if (session.recovery.recoveryAttempts > (options.maxAttempts || 3)) {
          throw new PaymentSessionError(
            'Maximum recovery attempts exceeded',
            'MAX_RECOVERY_ATTEMPTS_EXCEEDED',
            sessionId
          );
        }
        
        // 세션 상태를 복구됨으로 변경
        session.status = 'recovered';
        session.updatedAt = Date.now();
        
        await this.storage.set(sessionId, session);
        return session;
      }

      if (options.createNew) {
        // 새 세션 생성은 별도 로직 필요
        return null;
      }

      return null;
    } catch (error) {
      if (error instanceof PaymentSessionError) {
        throw error;
      }
      
      throw new PaymentSessionError(
        `Failed to recover payment session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SESSION_RECOVERY_FAILED',
        sessionId,
        error
      );
    }
  }

  /**
   * 사용자의 활성 세션 목록 조회
   */
  async getUserActiveSessions(userId: string): Promise<PaymentSessionData[]> {
    // 이 메서드는 실제 구현에서는 인덱스나 별도 저장소가 필요
    // 현재는 메모리 저장소의 제한으로 간단히 구현
    const sessions: PaymentSessionData[] = [];
    
    // 실제 구현에서는 데이터베이스 쿼리 등을 사용
    console.warn('getUserActiveSessions: This method needs proper indexing in production');
    
    return sessions;
  }

  /**
   * 만료된 세션 정리
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      return await this.storage.cleanup();
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * 자동 정리 시작
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(async () => {
      const cleaned = await this.cleanupExpiredSessions();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired payment sessions`);
      }
    }, this.config.cleanupInterval);
  }

  /**
   * 자동 정리 중지
   */
  private stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 세션 ID 생성
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `ps_${timestamp}_${random}`;
  }

  /**
   * 보안 토큰 생성
   */
  private generateSecurityToken(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    return `${timestamp.toString(36)}.${random}`;
  }

  /**
   * 체크섬 생성 (간단한 해시)
   */
  private generateChecksum(session: PaymentSessionData): string {
    const data = `${session.id}${session.userId}${session.amount}${session.createdAt}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 서비스 종료 (정리)
   */
  destroy(): void {
    this.stopCleanup();
  }
}

/**
 * 글로벌 Payment Session 서비스 인스턴스
 */
let globalPaymentSessionService: PaymentSessionService | null = null;

/**
 * Payment Session 서비스 싱글톤 인스턴스 획득
 */
export function getPaymentSessionService(storage?: SessionStorage): PaymentSessionService {
  if (!globalPaymentSessionService) {
    globalPaymentSessionService = new PaymentSessionService(storage);
  }
  
  return globalPaymentSessionService;
}

/**
 * Redis 기반 세션 저장소 (프로덕션용, 추후 구현)
 */
export class RedisSessionStorage implements SessionStorage {
  // Redis 클라이언트와 연동하는 구현이 필요
  // 현재는 인터페이스만 제공
  
  async get(sessionId: string): Promise<PaymentSessionData | null> {
    throw new Error('RedisSessionStorage not implemented yet');
  }

  async set(sessionId: string, data: PaymentSessionData, ttl?: number): Promise<void> {
    throw new Error('RedisSessionStorage not implemented yet');
  }

  async delete(sessionId: string): Promise<void> {
    throw new Error('RedisSessionStorage not implemented yet');
  }

  async exists(sessionId: string): Promise<boolean> {
    throw new Error('RedisSessionStorage not implemented yet');
  }

  async extend(sessionId: string, ttl: number): Promise<void> {
    throw new Error('RedisSessionStorage not implemented yet');
  }

  async cleanup(): Promise<number> {
    throw new Error('RedisSessionStorage not implemented yet');
  }
}

// Types are already exported inline above