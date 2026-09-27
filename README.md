# Picnic Web

피크닠 웹 애플리케이션입니다.

[![Test and Coverage](https://github.com/username/picnic-web/actions/workflows/test-coverage.yml/badge.svg)](https://github.com/username/picnic-web/actions/workflows/test-coverage.yml)
[![codecov](https://codecov.io/gh/username/picnic-web/branch/main/graph/badge.svg)](https://codecov.io/gh/username/picnic-web)

## 개발 시작하기

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

## 환경 변수 설정

프로젝트를 실행하려면 루트 디렉토리에 `.env.local` 파일을 생성하고 다음 환경 변수를 설정해야 합니다.

`.env.local.example` 파일을 참고하여 `.env.local` 파일을 생성하세요. 만약 `.env.local.example` 파일이 없다면, 아래 내용을 기반으로 직접 생성해주세요.

**.env.local.example**
```
# Supabase Project URL
SUPABASE_URL="YOUR_SUPABASE_URL"

# Supabase Public Anon Key
SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"

# Supabase Service Role Key (Keep this secret!)
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_ROLE_KEY"

# Base URL for the application
BASE_URL="http://localhost:3000"
```

필요한 환경 변수는 다음과 같습니다.

- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_ANON_KEY`: Supabase 프로젝트의 public-facing anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase 프로젝트의 service_role key (서버 전용, 절대 노출 금지)
- `BASE_URL`: 배포된 애플리케이션의 기본 URL (예: http://localhost:3000)

`SUPABASE_SERVICE_ROLE_KEY`를 제외한 나머지 키들은 Supabase 프로젝트 대시보드의 API 설정에서 찾을 수 있습니다. `SUPABASE_SERVICE_ROLE_KEY`는 Project Settings > API 에서 찾을 수 있으며, 강력한 권한을 가지므로 신중하게 다루어야 합니다.

## Supabase 타입 동기화

DB 스키마는 [`picnic-supabase`](https://github.com/charlie0421/picnic-supabase) 레포가 소유합니다. 마이그레이션이 배포된 뒤 이 레포의 타입은 **명시적으로** 동기화합니다.

```bash
npm run schema:types:sync   # (별칭: npm run gen:types)
git diff types/             # 변경 확인 후 커밋
```

- `supabase` CLI 로그인이 필요하며, 원격 PICNIC-PROD 스키마로 `types/supabase.ts` 와 생성 인터페이스를 갱신합니다.
- 생성이 실패하거나 결과가 비정상이면 기존 파일을 그대로 둡니다.
- `dev`/`build`/`start` 는 더 이상 타입 생성을 자동 실행하지 않습니다(네트워크 의존·추적 파일 덮어쓰기 방지).

## 테스트 실행하기

```bash
# 모든 테스트 실행
npm test

# 테스트 커버리지 보고서 생성
npm run test:coverage
```

코드 커버리지 임계값은 70%로 설정되어 있습니다.