import { MediaSkeleton } from '@/components/client/media';

/**
 * 미디어 페이지의 로딩 상태 컴포넌트
 * 
 * 미디어 페이지 데이터를 불러오는 동안 표시될 스켈레톤 UI입니다.
 * Next.js가 자동으로 이 컴포넌트를 Suspense fallback으로 사용합니다.
 */
export default function MediaLoading() {
  return <MediaSkeleton />;
} 