/**
 * 컴포넌트 메인 인덱스
 * 
 * 새로운 구조: server, client, common 중심
 * 기술적 관심사에 따른 분리로 Next.js App Router에 최적화
 */

// 서버 컴포넌트 (SSR, 데이터 페칭)
export * from './server';

// 클라이언트 컴포넌트 (인터랙션, 상태 관리)
export * from './client';

// 디자인 시스템 & 공통 UI
export * from './common';

// Feature Modules (기존 호환성 유지)
// export * from './features';

// 레이아웃 & 프로바이더

// Utils
export * from './utils'; 