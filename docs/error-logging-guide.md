# 에러 로깅 및 모니터링 시스템 가이드

## 개요

Picnic Web 애플리케이션의 중앙화된 에러 로깅 및 모니터링 시스템입니다. 이 시스템은 다양한 로그 레벨과 컨텍스트를 지원하며, 개발 환경에서는 콘솔에, 프로덕션 환경에서는 콘솔과 Sentry에 로그를 보냅니다.

## 주요 기능

- **다중 로그 레벨**: DEBUG, INFO, WARN, ERROR, FATAL
- **다중 로그 대상**: 콘솔, Sentry
- **자동 컨텍스트 수집**: 요청 정보, 사용자 정보, 에러 스택 트레이스
- **성능 모니터링**: 작업 실행 시간 측정
- **자동 에러 분류**: 카테고리, 심각도, 재시도 가능성

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
import { createRequestLogger } from '@/utils/logger-utils';

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

## 로그 대상 설정

### 기본 설정

```typescript
import { Logger } from '@/utils/logger';

// 개발 환경: 콘솔만
// 프로덕션 환경: 콘솔 + Sentry
const logger = new Logger({
  environment: process.env.NODE_ENV,
  service: 'picnic-web',
  version: process.env.npm_package_version,
});
```

### 커스텀 설정

```typescript
import { Logger, ConsoleLogTarget, SentryLogTarget } from '@/utils/logger';

const customLogger = new Logger({
  environment: 'production',
  service: 'picnic-api',
  targets: [
    new ConsoleLogTarget(),
    new SentryLogTarget(),
  ],
});

// 특정 타겟 제거
customLogger.removeTarget('console');
```

### SentryLogTarget 동작

- `ERROR` 와 `FATAL` 레벨만 Sentry 로 전송한다. 그보다 낮은 레벨까지 보내면
  이슈 목록이 잡음으로 덮인다.
- 원본 Error 의 스택 트레이스를 보존한다.
- `service` / `environment` / `version` 은 태그로, `context` 와 `request` 는
  컨텍스트로, `user` 는 Sentry user 로 붙는다.
- Sentry 전송이 실패해도 예외를 던지지 않는다. 로깅 실패가 요청을 깨뜨리면 안 된다.

Sentry 초기화는 `instrumentation-client.ts`, `sentry.server.config.js`,
`sentry.edge.config.js` 에 있다.

## 모니터링 및 알림

에러는 Sentry 대시보드에서 확인한다. 이슈 검색에 다음 태그를 쓸 수 있다.

- `service:picnic-web`
- `environment:production`
- `level:error` / `level:fatal`

## 외부 서비스 연동

Sentry 연동은 `SentryLogTarget` 으로 이미 구현돼 있다 (`utils/logger-targets.ts`).
별도 연동 코드를 작성할 필요가 없다.

다른 서비스(LogRocket, DataDog 등)를 붙이려면 `LogTarget` 인터페이스를 구현하고
`logger.addTarget()` 으로 등록한다.

```typescript
import { logger } from '@/utils/logger';
import type { LogEntry, LogTarget } from '@/utils/logger-types';

class MyTarget implements LogTarget {
  name = 'my-service';
  async write(entry: LogEntry): Promise<void> {
    // 전송 실패가 요청을 깨뜨리지 않도록 반드시 try/catch 로 감싼다
  }
}

logger.addTarget(new MyTarget());
```

## 문제 해결

### 1. Sentry 전송 실패

```typescript
// SentryLogTarget 은 실패해도 예외를 던지지 않는다.
// 콘솔에서 "Sentry 로그 전송 실패" 메시지를 확인한다.
// 프로덕션이 아니면 SentryLogTarget 은 애초에 등록되지 않는다.
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
- `instrumentation.ts` - Sentry 서버/edge 초기화 진입점
- `utils/logger-targets.ts` - 로그 대상 구현 (ConsoleLogTarget, SentryLogTarget)
- `docs/error-logging-guide.md` - 이 가이드 문서 