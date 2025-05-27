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
export async function VoteDetailFetcher({
  id,
  className,
}: VoteDetailFetcherProps) {
  try {
    console.log('[VoteDetailFetcher] 시작 - ID:', id);

    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      console.error('[VoteDetailFetcher] 유효하지 않은 ID:', id);
      notFound();
    }

    console.log('[VoteDetailFetcher] 파싱된 ID:', numericId);

    // 환경 변수 확인
    console.log(
      '[VoteDetailFetcher] Supabase URL 존재:',
      !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
    console.log(
      '[VoteDetailFetcher] Supabase Key 존재:',
      !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );

    // vote-service를 사용하여 데이터 조회
    console.log('[VoteDetailFetcher] getVoteById 호출 시작');
    const voteData = await getVoteById(numericId);
    console.log(
      '[VoteDetailFetcher] getVoteById 결과:',
      voteData ? '데이터 있음' : '데이터 없음',
    );

    if (!voteData) {
      console.log(
        '[VoteDetailFetcher] 투표 데이터 없음 - notFound 호출:',
        numericId,
      );
      notFound();
    }

    console.log('[VoteDetailFetcher] 투표 데이터 로드 성공:', {
      id: voteData.id,
      title: voteData.title,
      voteItemCount: voteData.voteItem?.length || 0,
      voteRewardCount: voteData.voteReward?.length || 0,
    });

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

    console.log('[VoteDetailFetcher] 투표 상태:', voteStatus);

    return (
      <VoteDetailPresenter
        vote={voteData}
        initialItems={voteData.voteItem || []}
        rewards={voteData.voteReward || []}
        className={className}
      />
    );
  } catch (error) {
    console.error('[VoteDetailFetcher] 에러 발생:', error);
    console.error(
      '[VoteDetailFetcher] 에러 스택:',
      error instanceof Error ? error.stack : '스택 없음',
    );

    // 개발 환경에서만 상세 에러 표시
    if (process.env.NODE_ENV === 'development') {
      return (
        <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
          <h2 className='text-red-800 font-semibold'>
            투표 로드 에러 (개발 모드)
          </h2>
          <p className='text-red-600 text-sm mt-2'>ID: {id}</p>
          <p className='text-red-600 text-sm'>
            Supabase URL:{' '}
            {process.env.NEXT_PUBLIC_SUPABASE_URL ? '설정됨' : '설정되지 않음'}
          </p>
          <p className='text-red-600 text-sm'>
            Supabase Key:{' '}
            {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
              ? '설정됨'
              : '설정되지 않음'}
          </p>
          <pre className='text-red-500 text-xs mt-2 overflow-auto max-h-40'>
            {error instanceof Error ? error.message : '알 수 없는 에러'}
          </pre>
          <details className='mt-2'>
            <summary className='text-red-600 text-sm cursor-pointer'>
              스택 트레이스 보기
            </summary>
            <pre className='text-red-500 text-xs mt-1 overflow-auto max-h-60'>
              {error instanceof Error ? error.stack : '스택 정보 없음'}
            </pre>
          </details>
        </div>
      );
    }

    // 프로덕션에서는 404로 처리
    notFound();
  }
}
