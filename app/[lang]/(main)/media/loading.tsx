import { LoadingState } from '@/components/server';

/**
 * 미디어 페이지의 로딩 상태 컴포넌트
 * 
 * 미디어 데이터를 불러오는 동안 표시될 로딩 인디케이터입니다.
 */
export default function MediaLoading() {
  return <LoadingState message="미디어 콘텐츠를 불러오는 중입니다..." fullPage size="large" />;
} 