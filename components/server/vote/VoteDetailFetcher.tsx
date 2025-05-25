import { notFound } from 'next/navigation';
import { Vote, VoteItem, Reward } from '@/types/interfaces';
import { getVoteById } from '@/lib/data-fetching/vote-service';
import { VoteDetailPresenter } from '@/components/client';

export interface VoteDetailFetcherProps {
  id: string;
  className?: string;
}

/**
 * 투표 상세 데이터를 가져오는 서버 컴포넌트
 * vote-service를 사용하여 데이터를 조회합니다.
 */
export async function VoteDetailFetcher({ id, className }: VoteDetailFetcherProps) {
  try {
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      console.error('[VoteDetailFetcher] 유효하지 않은 ID:', id);
      notFound();
    }

    // vote-service를 사용하여 데이터 조회
    const voteData = await getVoteById(numericId);
    if (!voteData) {
      console.log('[VoteDetailFetcher] 투표 데이터 없음:', numericId);
      notFound();
    }

    // 투표 상태 계산
    const now = new Date();
    const startDate = voteData.start_at ? new Date(voteData.start_at) : null;
    const endDate = voteData.stop_at ? new Date(voteData.stop_at) : null;

    let voteStatus: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
    if (startDate && endDate) {
      if (now < startDate) {
        voteStatus = 'upcoming';
      } else if (now < endDate) {
        voteStatus = 'ongoing';
      } else {
        voteStatus = 'ended';
      }
    }

    return (
      <VoteDetailPresenter 
        vote={voteData}
        initialItems={voteData.voteItem || []}
        rewards={voteData.voteReward || []}
        className={className}
      />
    );

  } catch (error) {
    console.error('[VoteDetailFetcher] 에러:', error);
    
    // 개발 환경에서만 상세 에러 표시
    if (process.env.NODE_ENV === 'development') {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <h2 className="text-red-800 font-semibold">투표 로드 에러</h2>
          <p className="text-red-600 text-sm mt-2">
            ID: {id}
          </p>
          <pre className="text-red-500 text-xs mt-2 overflow-auto">
            {error instanceof Error ? error.message : '알 수 없는 에러'}
          </pre>
        </div>
      );
    }
    
    // 프로덕션에서는 404로 처리
    notFound();
  }
} 