'use client';

/**
 * 클라이언트 컴포넌트 인덱스
 * 
 * 이 파일은 클라이언트 컴포넌트를 다른 파일에서 쉽게 임포트할 수 있도록 합니다.
 * 새로운 클라이언트 컴포넌트가 추가될 때마다 이 파일에도 추가해야 합니다.
 */

// 도메인별 클라이언트 컴포넌트
export * from './vote';
export * from './auth';
export * from './media';
export * from './reward';
export * from './banner';

// 기타 클라이언트 컴포넌트
export { LoadingSpinner } from './common/LoadingSpinner';
export { VoteItems } from './vote/list/VoteItems';
export { RetryButton } from './RetryButton';
export { VoteClientComponent } from './VoteClientComponent';
export { ClientNavigationSetter } from './ClientNavigationSetter';