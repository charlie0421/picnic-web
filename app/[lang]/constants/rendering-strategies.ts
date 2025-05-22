/**
 * 렌더링 전략 매핑
 * 
 * 이 파일은 애플리케이션의 각 경로에 대한 렌더링 전략을 문서화합니다.
 * Next.js의 정적 생성, 서버 사이드 렌더링, 클라이언트 렌더링 전략이 포함됩니다.
 */

export enum RenderingStrategy {
  // 정적 생성 (빌드 시 생성, 캐싱)
  STATIC = 'static',
  
  // 증분 정적 재생성 (지정된 간격으로 재생성)
  ISR = 'isr',
  
  // 동적 렌더링 (요청 시 서버에서 렌더링)
  DYNAMIC = 'dynamic',
  
  // 클라이언트 렌더링 (브라우저에서 렌더링)
  CLIENT = 'client',
  
  // 스트리밍 (점진적인 서버 렌더링)
  STREAMING = 'streaming'
}

/**
 * 경로별 렌더링 전략 매핑
 */
export const PAGE_RENDERING_STRATEGIES = {
  // 메인 경로
  '/': RenderingStrategy.STATIC,
  
  // 인증 관련 페이지
  '/login': RenderingStrategy.CLIENT,
  
  // 메인 컨텐츠 페이지
  '/media': RenderingStrategy.STREAMING,
  '/vote': RenderingStrategy.CLIENT,
  '/vote/[id]': RenderingStrategy.DYNAMIC,
  '/rewards': RenderingStrategy.CLIENT,
  '/rewards/[id]': RenderingStrategy.DYNAMIC,
  
  // 마이페이지 섹션
  '/mypage': RenderingStrategy.CLIENT,
  '/notice': RenderingStrategy.STATIC,
  '/notice/[id]': RenderingStrategy.DYNAMIC,
  '/faq': RenderingStrategy.STATIC,
  
  // 테스트 및 예제 페이지
  '/streaming-example': RenderingStrategy.STREAMING
};

/**
 * 추천 렌더링 전략 변경 사항
 * 
 * 현재 구현과 권장 최적화 사이의 차이를 문서화합니다.
 */
export const RECOMMENDED_RENDERING_CHANGES = {
  // 정적으로 변환할 수 있는 페이지
  '/rewards': {
    current: RenderingStrategy.CLIENT,
    recommended: RenderingStrategy.ISR,
    revalidate: 60, // 60초마다 재검증
    reason: '보상 목록은 자주 변경되지 않으므로 ISR로 최적화할 수 있습니다.'
  },
  
  // ISR로 최적화할 수 있는 동적 페이지
  '/vote/[id]': {
    current: RenderingStrategy.DYNAMIC,
    recommended: RenderingStrategy.ISR,
    revalidate: 30, // 30초마다 재검증
    reason: '투표 상세 정보는 캐싱하여 성능을 향상시킬 수 있습니다.'
  },
  
  // 스트리밍으로 개선할 수 있는 페이지
  '/rewards/[id]': {
    current: RenderingStrategy.DYNAMIC,
    recommended: RenderingStrategy.STREAMING,
    reason: '일부 콘텐츠를 더 빠르게 표시하기 위해 스트리밍을 활용할 수 있습니다.'
  }
};

/**
 * 캐싱 정책 제안
 */
export const CACHING_RECOMMENDATIONS = {
  // API 경로 캐싱
  '/api/votes': {
    strategy: 'stale-while-revalidate',
    maxAge: 60, // 60초
    staleWhileRevalidate: 300 // 5분
  },
  '/api/rewards': {
    strategy: 'stale-while-revalidate',
    maxAge: 120, // 2분
    staleWhileRevalidate: 600 // 10분
  },
  
  // 정적 자산 캐싱
  '/images': {
    strategy: 'cache-control',
    maxAge: 86400, // 1일
    immutable: true
  }
}; 