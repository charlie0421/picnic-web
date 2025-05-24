# Components 마이그레이션 계획

## 목표
1. **명확한 구조**: server/client/common 분리를 통한 역할 명확화
2. **도메인 중심**: features 폴더를 도메인별로 구조화
3. **재사용성 향상**: common 컴포넌트를 atomic design으로 구성

## 현재 구조의 문제점
- features 폴더가 평평한 구조로 복잡함
- server/client 경계가 불명확
- 도메인 간 의존성이 명확하지 않음
- 공통 컴포넌트가 산재되어 있음

## 새로운 구조

### 1. Common Components (Atomic Design)
```
common/
├── atoms/       # Button, Input, Badge, Icon 등
├── molecules/   # SearchBar, Card, Modal 등
└── organisms/   # Header, Footer, DataTable 등
```

### 2. Feature Modules (도메인별)
```
features/
├── vote/
│   ├── server/  # 데이터 페칭
│   ├── client/  # 인터랙션
│   ├── common/  # 도메인 내 공통
│   ├── types.ts
│   └── utils.ts
├── auth/
├── media/
└── reward/
```

### 3. 최상위 구조
```
components/
├── server/      # 도메인 독립적 서버 컴포넌트
├── client/      # 도메인 독립적 클라이언트 컴포넌트
├── common/      # Atomic Design 공통 컴포넌트
├── features/    # 도메인별 모듈
├── layouts/     # 레이아웃 컴포넌트
├── providers/   # 컨텍스트 프로바이더
└── utils/       # 유틸리티 함수
```

## 마이그레이션 단계

### Phase 1: 기초 구조 설정 (✅ 완료)
- [x] common 폴더 구조 생성
- [x] features 내 도메인별 구조 생성
- [x] README 및 가이드라인 작성

### Phase 2: Common Components 구축 (✅ 완료)
- [x] 기본 atoms 컴포넌트 생성
  - [x] Button
  - [x] Input
  - [ ] Label
  - [ ] Icon
  - [x] Badge
  - [x] Spinner
- [x] 기본 molecules 생성
  - [x] Card
  - [ ] Modal
  - [ ] SearchBar
- [ ] 기본 organisms 생성
- [x] 공통 유틸리티 함수 (cn)

### Phase 3: Vote 도메인 마이그레이션 (✅ 98% 완료)
- [x] types.ts 정의
- [x] utils.ts 구현
- [x] 컴포넌트 분류 및 이동
  - [x] Server components
    - [x] VoteListFetcher
    - [x] VoteDetailFetcher
    - [x] BannerListFetcher
  - [x] Client components
    - [x] VoteTimer
    - [x] VoteSearch
    - [x] VoteButton
    - [x] VoteListPresenter
    - [x] VoteDetailPresenter
    - [x] VoteRankCard
    - [x] BannerList
    - [x] BannerItem
    - [x] BannerListWrapper
  - [x] Common components
    - [x] VoteStatus
    - [x] VoteCard
- [x] index.ts 공개 API 정의
- [x] import 경로 업데이트 (일부)
- [x] 기존 컴포넌트 마이그레이션
  - [x] VoteDetailContent → VoteDetailFetcher + VoteDetailPresenter
  - [x] VoteRankCard → client/VoteRankCard
  - [x] BannerList/BannerItem → client/BannerList, client/BannerItem
  - [x] BannerList 사용처 업데이트
  - [ ] list 폴더 내 컴포넌트들
  - [ ] dialogs 폴더 내 컴포넌트들
  - [ ] 기타 남은 컴포넌트들

### Phase 4: 다른 도메인 마이그레이션 (✅ 기본 구조 완료)
- [✅] Auth 도메인
  - [x] types.ts 정의
  - [x] utils.ts 구현
  - [x] index.ts 생성
  - [ ] 컴포넌트 마이그레이션
- [✅] Media 도메인
  - [x] types.ts 정의
  - [x] utils.ts 구현
  - [x] index.ts 생성
  - [ ] 컴포넌트 마이그레이션
- [✅] Reward 도메인
  - [x] types.ts 정의
  - [x] utils.ts 구현
  - [x] index.ts 생성
  - [ ] 컴포넌트 마이그레이션

### Phase 5: 최적화 및 정리
- [ ] 중복 코드 제거
- [ ] 불필요한 클라이언트 컴포넌트 서버로 전환
- [ ] 번들 사이즈 분석
- [ ] 테스트 작성
- [ ] App 라우트에서 import 경로 업데이트

## 마이그레이션 규칙

### 1. 컴포넌트 분류 기준
- **Server**: 데이터 페칭, 정적 렌더링
- **Client**: 인터랙션, 상태 관리, 브라우저 API
- **Common**: props만으로 동작, hooks 사용 안함

### 2. 네이밍 컨벤션
- Server: `*Fetcher.tsx`, `*Wrapper.tsx`
- Client: `*Interactive.tsx`, `*Controller.tsx`, `*Presenter.tsx`
- Common: 기능 그대로 (예: `VoteCard.tsx`)

### 3. Import 규칙
- 도메인 간: shared 통해서만
- common → 도메인 코드: 금지
- server → client: 허용
- client → server: 금지

### 4. 파일 구조
```typescript
// 각 컴포넌트 파일
export interface ComponentProps { ... }
export function Component() { ... }

// index.ts
export { Component } from './Component';
export type { ComponentProps } from './Component';
```

## 예상 효과
1. **개발 효율성**: 명확한 구조로 컴포넌트 찾기 쉬움
2. **성능 향상**: 서버/클라이언트 분리 최적화
3. **유지보수성**: 도메인별 독립성으로 변경 영향 최소화
4. **재사용성**: common 컴포넌트로 중복 제거

## 주의사항
- 기존 기능이 깨지지 않도록 점진적 마이그레이션
- 각 단계별로 테스트 확인
- import 경로 변경 시 전체 프로젝트 확인
- 타입 정의 누락 주의

## 진행 상황 요약
- **Phase 1**: ✅ 완료
- **Phase 2**: ✅ 완료 (기본 컴포넌트 생성)
- **Phase 3**: ✅ 진행중 (Vote 도메인 마이그레이션 - 98% 완료)
- **Phase 4**: ✅ 기본 구조 완료 (Auth, Media, Reward 도메인)
- **Phase 5**: ⏳ 대기중

## 완료된 주요 작업
1. **구조 설정**: 전체 폴더 구조 및 README 작성
2. **Common Components**: Button, Input, Badge, Spinner, Card 구현
3. **Vote 도메인**: 주요 컴포넌트 마이그레이션 및 import 경로 업데이트
4. **다른 도메인**: types.ts, utils.ts, index.ts 생성 완료
5. **Export 구조**: 계층적 export 구조 구현

## 남은 작업
1. Vote 도메인의 list, dialogs 폴더 정리 (2%)
2. 실제 컴포넌트들의 도메인별 마이그레이션
3. 나머지 App 라우트에서 import 경로 업데이트
4. 전체 프로젝트 최적화 및 테스트

## 현재 상황 (2025.05.24)

### ✅ 완료된 마이그레이션

#### 1단계 완료: features → server/client 분리
- ✅ `features/vote/client` → `client/vote`
- ✅ `features/vote/server` → `server/vote`

#### 2단계 완료: `shared` 폴더 제거
- ✅ `shared/vote/VoteCard.tsx` → `client/vote/VoteCard.tsx`
- ✅ `shared/vote/VoteStatus.tsx` → `client/vote/VoteStatus.tsx` 
- ✅ `shared/VoteDetail/` → `client/vote/VoteDetail/`
- ✅ `shared/AuthCallback/` → `client/auth/AuthCallback/`
- ✅ 모든 import 경로 업데이트
- ✅ index.ts 파일 정리
- ✅ 빌드 검증 완료

### 🎯 새로운 구조 (Next.js App Router 최적화)

```
components/
├── server/          # 서버 컴포넌트 (데이터 페칭, SSR)
├── client/          # 클라이언트 컴포넌트 (인터랙션, 상태)
├── common/          # 순수 UI 컴포넌트 (atoms, molecules)
├── layouts/         # 레이아웃 컴포넌트
├── providers/       # Context Providers
└── utils/           # 유틸리티 함수들
```

### 🔧 주요 개선 사항

1. **명확한 관심사 분리**:
   - 서버 컴포넌트: 데이터 페칭, SSR
   - 클라이언트 컴포넌트: 상태 관리, 인터랙션
   - 공통 컴포넌트: 재사용 가능한 UI

2. **Next.js App Router 최적화**:
   - 'use client' 지시어가 필요한 컴포넌트만 client 폴더에 위치
   - 서버 컴포넌트가 클라이언트 컴포넌트를 import하는 구조

3. **개발자 경험 향상**:
   - 폴더 구조만으로 컴포넌트의 성격 파악 가능
   - import 경로가 더 직관적

### 📝 다음 단계 (선택사항)

1. **features_backup 폴더 정리**:
   - 사용하지 않는 백업 파일들 제거
   - 필요한 컴포넌트들을 새 구조로 이전

2. **컴포넌트 의존성 최적화**:
   - 서버/클라이언트 간 불필요한 의존성 제거
   - 번들 크기 최적화

---
*마이그레이션 완료! 이제 Next.js App Router에 최적화된 깔끔한 구조를 가지게 되었습니다.*