# Components 구조 가이드

## 🏗️ 새로운 아키텍처 (2024.05 업데이트)

이 프로젝트는 **기술 중심 분리** 구조로 개편되어 Next.js App Router에 최적화되었습니다.

### 📁 폴더 구조

```
📁 components/
├── 📁 server/           # 🎯 서버 컴포넌트 (SSR, 데이터 페칭)
│   ├── 📁 vote/         # 투표 관련 서버 컴포넌트
│   ├── 📁 auth/         # 인증 관련 서버 컴포넌트 (추후 추가)
│   ├── 📁 media/        # 미디어 관련 서버 컴포넌트 (추후 추가)
│   └── 📁 reward/       # 리워드 관련 서버 컴포넌트 (추후 추가)
├── 📁 client/           # 🎯 클라이언트 컴포넌트 (인터랙션, 상태)
│   ├── 📁 vote/         # 투표 관련 클라이언트 컴포넌트
│   ├── 📁 auth/         # 인증 관련 클라이언트 컴포넌트
│   ├── 📁 media/        # 미디어 관련 클라이언트 컴포넌트
│   └── 📁 reward/       # 리워드 관련 클라이언트 컴포넌트
├── 📁 shared/           # 🎯 공유 컴포넌트 (서버+클라이언트 조합)
│   ├── 📁 vote/         # 투표 관련 공유 컴포넌트
│   └── 📁 auth/         # 인증 관련 공유 컴포넌트 (추후 추가)
├── 📁 common/           # 🎨 공통 UI 컴포넌트
├── 📁 utils/            # 🛠️ 유틸리티 함수
└── 📁 features_backup/  # 🗂️ 기존 구조 백업 (마이그레이션 완료 후 제거 예정)
```

## 🎯 컴포넌트 분류 기준

### 🖥️ Server Components (`server/`)
- **목적**: 서버에서 실행되는 컴포넌트
- **특징**: 
  - 데이터 페칭 (Supabase, API 호출)
  - SSR (Server-Side Rendering)
  - SEO 최적화
  - 번들 크기 최적화 (클라이언트로 전송되지 않음)
- **예시**: `VoteListFetcher`, `BannerListFetcher`

### 💻 Client Components (`client/`)
- **목적**: 클라이언트에서 실행되는 컴포넌트
- **특징**:
  - `'use client'` 지시어 필수
  - 사용자 인터랙션 처리
  - 상태 관리 (useState, useEffect 등)
  - 브라우저 API 사용
- **예시**: `VoteListPresenter`, `SocialLoginButtons`

### 🔄 Shared Components (`shared/`)
- **목적**: 서버와 클라이언트에서 모두 사용 가능한 컴포넌트
- **특징**:
  - 재사용 가능한 UI 조합
  - 서버 컴포넌트와 클라이언트 컴포넌트의 조합
  - 도메인별 공통 컴포넌트
- **예시**: `VoteCard`, `VoteStatus`

### 🎨 Common Components (`common/`)
- **목적**: 프로젝트 전체에서 사용되는 기본 UI 컴포넌트
- **특징**:
  - 도메인에 독립적
  - 디자인 시스템의 기본 요소
  - 재사용성이 높음
- **예시**: `Button`, `Card`, `Modal`

## 📝 사용 가이드

### Import 방법

```typescript
// 서버 컴포넌트
import { VoteListFetcher } from '@/components/server/vote';

// 클라이언트 컴포넌트
import { VoteListPresenter, SocialLoginButtons } from '@/components/client';

// 공유 컴포넌트
import { VoteCard } from '@/components/shared/vote';

// 공통 컴포넌트
import { Button, Card } from '@/components/common';
```

### 새로운 컴포넌트 추가 시

1. **컴포넌트 분류 결정**:
   - 서버에서만 실행? → `server/`
   - 클라이언트 인터랙션 필요? → `client/`
   - 서버+클라이언트 조합? → `shared/`
   - 도메인 독립적 UI? → `common/`

2. **적절한 폴더에 생성**:
   ```
   components/[category]/[domain]/ComponentName.tsx
   ```

3. **index.ts 파일 업데이트**:
   ```typescript
   export { ComponentName } from './ComponentName';
   ```

## 🚀 마이그레이션 가이드

### 기존 features 구조에서 새로운 구조로

1. **컴포넌트 분류**:
   - `'use client'` 있음 → `client/`
   - 데이터 페칭만 → `server/`
   - 재사용 UI → `shared/`

2. **Import 경로 변경**:
   ```typescript
   // Before
   import { Component } from '@/components/features/vote/client/Component';
   
   // After
   import { Component } from '@/components/client/vote';
   ```

3. **점진적 마이그레이션**:
   - 기존 `features_backup/` 폴더는 호환성 유지
   - 새로운 개발은 새로운 구조 사용
   - 기존 코드는 점진적으로 마이그레이션

## ✅ 장점

1. **명확한 기술적 분리**: 서버/클라이언트 구분이 명확
2. **Next.js App Router 최적화**: 하이드레이션 이슈 방지
3. **번들 크기 최적화**: 서버 코드가 클라이언트로 전송되지 않음
4. **개발 경험 개선**: 컴포넌트 찾기 쉬워짐
5. **확장성**: 새로운 도메인 추가 시 일관된 구조

## 🔧 개발 도구

### VS Code 확장 추천
- ES7+ React/Redux/React-Native snippets
- Auto Import - ES6, TS, JSX, TSX
- TypeScript Importer

### 코드 스니펫
```json
{
  "Server Component": {
    "prefix": "rsc",
    "body": [
      "// Server Component",
      "export async function ${1:ComponentName}() {",
      "  // 서버에서 데이터 페칭",
      "  return (",
      "    <div>",
      "      $0",
      "    </div>",
      "  );",
      "}"
    ]
  },
  "Client Component": {
    "prefix": "rcc",
    "body": [
      "'use client';",
      "",
      "// Client Component",
      "export function ${1:ComponentName}() {",
      "  // 클라이언트 상태 및 인터랙션",
      "  return (",
      "    <div>",
      "      $0",
      "    </div>",
      "  );",
      "}"
    ]
  }
}
```

---

**마지막 업데이트**: 2024년 5월 24일  
**버전**: 2.0 (기술 중심 구조) 