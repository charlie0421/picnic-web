# 에러 로깅 및 모니터링 시스템 가이드

## 개요

Picnic Web 애플리케이션의 중앙화된 에러 로깅 및 모니터링 시스템입니다. 이 시스템은 다양한 로그 레벨과 컨텍스트를 지원하며, 개발 환경에서는 콘솔에, 프로덕션 환경에서는 Supabase에 로그를 저장합니다.

## 주요 기능

- **다중 로그 레벨**: DEBUG, INFO, WARN, ERROR, FATAL
- **다중 로그 대상**: 콘솔, Supabase, 외부 모니터링 서비스
- **자동 컨텍스트 수집**: 요청 정보, 사용자 정보, 에러 스택 트레이스
- **성능 모니터링**: 작업 실행 시간 측정
- **자동 에러 분류**: 카테고리, 심각도, 재시도 가능성
- **통합 에러 핸들링**: API 라우트, 서버 액션과 자동 통합

## 기본 사용법

### 1. 기본 로깅

```typescript
import { logger } from '@/utils/logger';

// 정보 로그
await logger.info('사용자가 로그인했습니다', { userId: '123' });

// 경고 로그
await logger.warn('API 응답이 느립니다', { responseTime: 5000 });

// 에러 로그
await logger.error('데이터베이스 연결 실패', error, { 
  operation: 'user-fetch',
  retryCount: 3 
});

// 치명적 에러 로그
await logger.fatal('서버 메모리 부족', error, { 
  memoryUsage: '95%',
  availableMemory: '100MB' 
});
```

### 2. AppError 로깅

```typescript
import { AppError } from '@/utils/error';
import { logger } from '@/utils/logger';

const appError = new AppError(
  '사용자를 찾을 수 없습니다',
  ErrorCategory.NOT_FOUND,
  'low',
  404
);

// AppError 전용 로깅 메서드
await logger.logAppError(appError, {
  operation: 'user-lookup',
  searchCriteria: { email: 'user@example.com' }
});
```

### 3. 요청 컨텍스트 로깅

```typescript
import { createRequestLogger } from '@/utils/logger';

// API 라우트에서
export async function GET(request: Request) {
  const requestLogger = createRequestLogger(request);
  
  try {
    // 작업 수행
    const data = await fetchData();
    
    await requestLogger.info('데이터 조회 성공', { 
      recordCount: data.length 
    });
    
    return Response.json(data);
  } catch (error) {
    // 요청 컨텍스트가 자동으로 포함됨
    await requestLogger.error('데이터 조회 실패', error);
    throw error;
  }
}
```

### 4. 성능 모니터링

```typescript
import { startTimer, withLogging } from '@/utils/logger';

// 수동 타이머 사용
const timer = startTimer('database-query');
try {
  const result = await database.query('SELECT * FROM users');
  await timer.end({ recordCount: result.length });
  return result;
} catch (error) {
  await timer.endWithError(error);
  throw error;
}

// 함수 래핑 (자동 로깅)
const fetchUserData = withLogging(
  async (userId: string) => {
    return await database.user.findUnique({ where: { id: userId } });
  },
  'fetch-user-data'
);
```

## API 라우트 통합

### 자동 에러 핸들링

```typescript
import { withApiErrorHandler } from '@/utils/api-error-handler';

export const GET = withApiErrorHandler(async (request) => {
  // 요청 시작/완료/실패가 자동으로 로깅됨
  const data = await fetchData();
  return Response.json(data);
});
```

### 수동 로깅

```typescript
import { createRequestLogger } from '@/utils/logger';
import { ApiErrorHandler } from '@/utils/api-error-handler';

export async function POST(request: Request) {
  const requestLogger = createRequestLogger(request);
  
  try {
    const body = await request.json();
    
    await requestLogger.info('투표 생성 요청', { 
      title: body.title,
      optionCount: body.options?.length 
    });
    
    const vote = await createVote(body);
    
    await requestLogger.info('투표 생성 완료', { 
      voteId: vote.id 
    });
    
    return ApiErrorHandler.createSuccessResponse(vote);
  } catch (error) {
    return ApiErrorHandler.handleApiError(error, request);
  }
}
```

## 서버 액션 통합

### 자동 에러 핸들링

```typescript
import { withServerActionErrorHandler } from '@/utils/server-action-error-handler';

export const submitVote = withServerActionErrorHandler(
  async (voteId: string, optionId: string) => {
    // 액션 시작/완료/실패가 자동으로 로깅됨
    return await database.vote.update({
      where: { id: voteId },
      data: { selectedOption: optionId }
    });
  },
  'submit-vote'
);
```

### 수동 로깅

```typescript
import { logger } from '@/utils/logger';
import { ServerActionErrorHandler } from '@/utils/server-action-error-handler';

export async function createVote(formData: FormData) {
  try {
    const title = formData.get('title') as string;
    
    await logger.info('투표 생성 시작', { 
      title,
      isServerAction: true 
    });
    
    const vote = await database.vote.create({
      data: { title, options: [] }
    });
    
    await logger.info('투표 생성 완료', { 
      voteId: vote.id,
      isServerAction: true 
    });
    
    return ServerActionErrorHandler.createSuccessResult(vote);
  } catch (error) {
    return ServerActionErrorHandler.handleServerActionError(
      error, 
      'create-vote'
    );
  }
}
```

## 로그 대상 설정

### 기본 설정

```typescript
import { Logger, ConsoleLogTarget, SupabaseLogTarget } from '@/utils/logger';

// 개발 환경: 콘솔만
// 프로덕션 환경: 콘솔 + Supabase
const logger = new Logger({
  environment: process.env.NODE_ENV,
  service: 'picnic-web',
  version: process.env.npm_package_version,
});
```

### 커스텀 설정

```typescript
import { 
  Logger, 
  ConsoleLogTarget, 
  SupabaseLogTarget, 
  ExternalMonitoringTarget 
} from '@/utils/logger';

const customLogger = new Logger({
  environment: 'production',
  service: 'picnic-api',
  targets: [
    new ConsoleLogTarget(),
    new SupabaseLogTarget(),
    new ExternalMonitoringTarget(), // Sentry, LogRocket 등
  ],
});

// 외부 모니터링 서비스 추가
customLogger.addTarget(new ExternalMonitoringTarget());

// 특정 타겟 제거
customLogger.removeTarget('console');
```

## Supabase 설정

### 1. 테이블 생성

`scripts/create-error-logs-table.sql` 파일을 Supabase SQL Editor에서 실행:

```sql
-- 에러 로그 테이블과 관련 인덱스, 뷰, 함수 생성
-- (파일 내용 참조)
```

### 2. RLS 정책

- **관리자**: 모든 로그 접근 가능
- **사용자**: 자신의 로그만 조회 가능
- **서비스**: 로그 삽입 가능

### 3. 자동 정리

```sql
-- 매일 새벽 2시에 오래된 로그 정리
SELECT cron.schedule(
  'cleanup-error-logs', 
  '0 2 * * *', 
  'SELECT cleanup_old_error_logs();'
);
```

## 모니터링 및 알림

### 에러 통계 조회

```sql
-- 최근 24시간 에러 통계
SELECT * FROM error_log_stats;

-- 최근 1시간 치명적 에러
SELECT * FROM recent_errors;

-- 에러 트렌드 분석
SELECT * FROM get_error_trends('2024-01-01'::timestamptz, NOW());
```

### 실시간 알림

```sql
-- 치명적 에러 발생 시 자동 알림 (트리거)
-- notify_critical_error() 함수에서 외부 알림 시스템 연동
```

## 외부 서비스 연동

### Sentry 연동 예시

```typescript
// utils/logger.ts의 ExternalMonitoringTarget에서
import * as Sentry from '@sentry/node';

private async sendToExternalService(entry: LogEntry): Promise<void> {
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(new Error(entry.message), {
      level: entry.level as any,
      contexts: {
        error: entry.error,
        user: entry.user,
        request: entry.request,
      },
      tags: {
        environment: entry.environment,
        service: entry.service,
      },
    });
  }
}
```

## 베스트 프랙티스

### 1. 로그 레벨 선택

- **DEBUG**: 개발 중 디버깅 정보 (프로덕션에서는 기록되지 않음)
- **INFO**: 일반적인 애플리케이션 흐름 정보
- **WARN**: 잠재적 문제나 예상치 못한 상황
- **ERROR**: 처리 가능한 에러 상황
- **FATAL**: 애플리케이션 중단을 야기할 수 있는 치명적 에러

### 2. 컨텍스트 정보

```typescript
// 좋은 예: 충분한 컨텍스트 제공
await logger.error('사용자 인증 실패', error, {
  userId: user.id,
  loginAttempt: 3,
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
  timestamp: new Date().toISOString(),
});

// 나쁜 예: 컨텍스트 부족
await logger.error('인증 실패', error);
```

### 3. 민감한 정보 보호

```typescript
// 좋은 예: 민감한 정보 마스킹
await logger.info('사용자 로그인', {
  userId: user.id,
  email: user.email.replace(/(.{2}).*(@.*)/, '$1***$2'),
  // 비밀번호나 토큰은 절대 로깅하지 않음
});

// 나쁜 예: 민감한 정보 노출
await logger.info('사용자 로그인', {
  password: user.password, // 절대 하지 말 것!
  token: authToken, // 절대 하지 말 것!
});
```

### 4. 성능 고려사항

```typescript
// 좋은 예: 비동기 로깅으로 성능 영향 최소화
logger.info('작업 완료', context); // await 없이 호출 가능

// 중요한 에러는 반드시 await
await logger.fatal('치명적 에러', error, context);
```

## 문제 해결

### 1. Supabase 연결 실패

```typescript
// SupabaseLogTarget에서 자동으로 콘솔로 폴백
// 에러 로그에서 "Supabase 로그 저장 실패" 메시지 확인
```

### 2. 로그 누락

- RLS 정책 확인
- API 키 권한 확인
- 네트워크 연결 상태 확인

### 3. 성능 문제

- 로그 레벨 조정 (DEBUG 로그 비활성화)
- 배치 로깅 구현 고려
- 로그 대상 최적화

## 관련 파일

- `utils/logger.ts` - 메인 로깅 시스템
- `utils/api-error-handler.ts` - API 라우트 통합
- `utils/server-action-error-handler.ts` - 서버 액션 통합
- `scripts/create-error-logs-table.sql` - Supabase 테이블 설정
- `docs/error-logging-guide.md` - 이 가이드 문서 