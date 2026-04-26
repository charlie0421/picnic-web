---
description: Vote 페이지의 사용하지 않는 JavaScript 384KiB 감축 전략
author: GPT-5 Codex
createdAt: 2025-11-20
---

# Vote 페이지 번들 경량화 로드맵

최근 Lighthouse 측정에서 **사용하지 않는 JavaScript 384 KiB**가 감지되었습니다.  
해당 수치는 투표 페이지의 초기 로딩 시간·TBT를 악화시키는 주요 원인으로 파악되었습니다.  
아래는 제거/지연 로딩 가능한 후보를 중심으로 한 경량화 전략입니다.

## 1. 코드 스플리팅 및 지연 로딩
- **투표 카드 부가 UI 지연 로딩**  
  - `RewardItem`, `VoteItems` 안의 상세/랭킹 UI를 `next/dynamic({ ssr: false })`로 분리하고, 동일한 높이의 플레이스홀더를 제공해 CLS를 방지합니다.  
  - 상세 페이지 전용 로직(`mode="detail"`)은 별도 번들로 분리하여 리스트 초기 렌더 시 로드하지 않도록 합니다.
- **필터/검색 패널 동적 로딩**  
  - 상단 필터(`VoteFilterSection`, `VoteStatusFilter`, `VoteAreaFilter`)를 사용 시점에 동적으로 로드합니다.  
  - URL 파라미터로 제어되는 기본 필터는 서버 컴포넌트에서 처리하고, 추가 인터랙션만 지연 로딩된 클라이언트 모듈에 위임합니다.

## 2. 외부 라이브러리 대체 및 정리
- **Zustand 스토어 축소**  
  - `useLanguageStore`에서 투표 목록에 필요한 최소 데이터(현재 언어, 번역 함수)만 추출한 서브 스토어로 분리해 번들 크기를 줄입니다.  
  - 투표 페이지에서만 사용하는 텍스트는 정적 사전(서버 컴포넌트)으로 주입하는 방안을 평가합니다.
- **불필요한 유틸/폴리필 제거**  
  - `formatRelativeTime` 등 대체 가능한 유틸을 `Intl.RelativeTimeFormat` 기반 경량 구현으로 교체합니다.  
  - `CountdownTimer`의 애니메이션 의존성(`framer-motion` 등)이 불필요하다면 제거하거나 CSS 전환으로 단순화합니다.

## 3. 네트워크 레벨 최적화
- **Route-level Prefetch 제어**  
  - `NavigationLink`의 자동 prefetch를 비활성화하여 불필요한 상세 페이지 JS 다운로드를 방지합니다.  
  - 사용자 스크롤 위치를 감지해 현재 카드와 가까운 항목만 부분 prefetch하도록 조정합니다.
- **LCP 후보 자원 우선순위 재정의**  
  - `OptimizedImage`에 `fetchPriority="high"`를 적용한 배너/1위 카드만 `preload`하고, 나머지는 지연 로딩합니다.

## 4. 검증 플랜
- 각 단계 적용 후 `VERCEL=1 npm run build` → `.next/static/chunks/app/vote/page-*.js` 사이즈 추적  
- Lighthouse (`pagespeed.web.dev`) 및 `Chrome DevTools Coverage`로 실제 미사용 바이트 감소 확인  
- TBT·LCP 변화량을 Release note에 기록하여 회귀 방지

> **우선순위 제안**  
> 1) RewardItem/VoteItems 지연 로딩 → 2) 필터 패널 코드 스플리팅 → 3) 언어/타이머 유틸 경량화  
> 단계별로 측정 후 추가 감축이 필요하면 외부 라이브러리 교체를 검토합니다.

