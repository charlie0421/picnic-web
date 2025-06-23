import { VoteDetailSkeleton } from '@/components/server';

/**
 * 투표 상세 페이지의 로딩 상태 컴포넌트
 * 
 * 투표 데이터를 불러오는 동안 표시될 스켈레톤 UI입니다.
 */
export default function VoteDetailLoading() {
  return <VoteDetailSkeleton />;
} 