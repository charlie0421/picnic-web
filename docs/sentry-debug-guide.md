# 🔧 Sentry 403 Forbidden 에러 해결 가이드

## 문제 상황
개발 환경에서 브라우저 개발자 도구에 다음과 같은 에러가 표시되는 경우:

```
fetch.js:53 POST https://o4504959853133824.ingest.sentry.io/api/4504959855034368/envelope/?sentry_version=7&sentry_key=31fb3b4f6e7348de8efcdaab14dc7e7a&sentry_client=sentry.javascript.nextjs%2F9.35.0 403 (Forbidden)
```

## 해결 방법

### 1. 개발 환경에서 Sentry 비활성화 (권장)

개발 중에 Sentry를 사용하지 않으려면:

1. **`.env.local` 파일이 없는 경우**: 자동으로 Sentry가 비활성화됩니다.
2. **`.env.local` 파일이 있는 경우**: `NEXT_PUBLIC_SENTRY_DSN` 설정을 주석 처리하거나 삭제하세요.

### 2. 개발 환경에서 Sentry 활성화

개발 중에 Sentry를 사용하려면:

1. **`.env.local` 파일 생성**:
   ```bash
   cp .env.local.example .env.local
   ```

2. **올바른 DSN 설정**:
   ```bash
   # .env.local 파일에서 주석 해제하고 실제 값으로 변경
   NEXT_PUBLIC_SENTRY_DSN=https://your-actual-dsn@sentry.io/project-id
   SENTRY_AUTH_TOKEN=your-sentry-auth-token
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   ```

3. **개발 서버 재시작**:
   ```bash
   npm run dev
   ```

### 3. 코드 수정 내용

현재 코드는 다음과 같이 수정되었습니다:

- DSN이 설정되지 않은 경우 자동으로 Sentry 초기화를 건너뛰기
- 개발 환경에서 경고 메시지 출력
- 403 에러 방지

### 4. 확인 방법

**개발 환경에서 Sentry가 비활성화된 경우**: 브라우저 콘솔에서 다음 메시지가 표시됩니다:
```
⚠️ Sentry DSN이 설정되지 않았습니다. Sentry 초기화를 건너뜁니다.
```

**개발 환경에서 Sentry가 활성화된 경우**: 브라우저 콘솔에서 403 에러가 사라집니다.

### 5. 프로덕션 환경

프로덕션 환경에서는 Vercel 환경 변수에 올바른 Sentry 설정이 있어야 합니다:

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

## 추가 도움

- [Sentry 공식 문서](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Next.js Sentry 설정 가이드](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/)

---

## 빠른 해결책

**대부분의 경우 이것만으로 충분합니다:**
- `.env.local` 파일이 없으면 그대로 두기
- `.env.local` 파일이 있으면 `NEXT_PUBLIC_SENTRY_DSN` 라인을 주석 처리하거나 삭제
- 개발 서버 재시작

이렇게 하면 403 에러가 더 이상 발생하지 않습니다. 