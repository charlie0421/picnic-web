/**
 * 서버 컴포넌트 인덱스
 * 
 * 이 파일은 서버 컴포넌트를 다른 파일에서 쉽게 임포트할 수 있도록 합니다.
 * 새로운 서버 컴포넌트가 추가될 때마다 이 파일에도 추가해야 합니다.
 */

// 도메인별 서버 컴포넌트
export * from './vote';
export * from './banner';
export * from './media';
export * from './reward';
// export * from './auth';    // 추후 추가 예정

// 기타 서버 컴포넌트
export { default as LoadingState } from './LoadingState';
export { default as ErrorState } from './ErrorState';
export { default as VoteDetailSkeleton } from './VoteDetailSkeleton';
export { default as AuthCallbackSkeleton } from './AuthCallbackSkeleton';

// 에러 처리 관련 컴포넌트
export { default as ErrorBoundary } from './ErrorBoundary';
export { default as AsyncBoundary } from './AsyncBoundary';
export { default as NotFoundState } from './NotFoundState';

// React Suspense 관련 컴포넌트
export { default as ParallelDataFetching } from './ParallelDataFetching';
export { default as NestedDataFetching } from './NestedDataFetching';
export { default as ServerClientBoundary } from './ServerClientBoundary';
export { default as VoteDataExample } from './VoteDataExample';

// 스켈레톤 컴포넌트들
export { default as BannerSkeleton } from './banner/BannerSkeleton';
export { default as VoteListSkeleton } from './vote/VoteListSkeleton'; 