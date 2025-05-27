import { getVotes } from '@/lib/data-fetching/vote-service';

export default async function VoteDebugPage() {
  try {
    console.log('[VoteDebugPage] 모든 투표 조회 시작');

    // 모든 상태의 투표 조회
    const ongoingVotes = await getVotes('ongoing');
    const upcomingVotes = await getVotes('upcoming');
    const completedVotes = await getVotes('completed');

    console.log('[VoteDebugPage] 투표 조회 완료:', {
      ongoing: ongoingVotes.length,
      upcoming: upcomingVotes.length,
      completed: completedVotes.length,
    });

    return (
      <div className='container mx-auto p-4'>
        <h1 className='text-2xl font-bold mb-4'>투표 데이터 디버그</h1>

        <div className='space-y-6'>
          <div>
            <h2 className='text-xl font-semibold mb-2'>
              진행 중인 투표 ({ongoingVotes.length}개)
            </h2>
            {ongoingVotes.map((vote) => (
              <div key={vote.id} className='p-2 border rounded mb-2'>
                <p>
                  <strong>ID:</strong> {vote.id}
                </p>
                <p>
                  <strong>제목:</strong>{' '}
                  {typeof vote.title === 'string'
                    ? vote.title
                    : JSON.stringify(vote.title)}
                </p>
                <p>
                  <strong>링크:</strong>{' '}
                  <a
                    href={`/ko/vote/${vote.id}`}
                    className='text-blue-500 underline'
                  >
                    /ko/vote/{vote.id}
                  </a>
                </p>
              </div>
            ))}
          </div>

          <div>
            <h2 className='text-xl font-semibold mb-2'>
              예정된 투표 ({upcomingVotes.length}개)
            </h2>
            {upcomingVotes.map((vote) => (
              <div key={vote.id} className='p-2 border rounded mb-2'>
                <p>
                  <strong>ID:</strong> {vote.id}
                </p>
                <p>
                  <strong>제목:</strong>{' '}
                  {typeof vote.title === 'string'
                    ? vote.title
                    : JSON.stringify(vote.title)}
                </p>
                <p>
                  <strong>링크:</strong>{' '}
                  <a
                    href={`/ko/vote/${vote.id}`}
                    className='text-blue-500 underline'
                  >
                    /ko/vote/{vote.id}
                  </a>
                </p>
              </div>
            ))}
          </div>

          <div>
            <h2 className='text-xl font-semibold mb-2'>
              완료된 투표 ({completedVotes.length}개)
            </h2>
            {completedVotes.map((vote) => (
              <div key={vote.id} className='p-2 border rounded mb-2'>
                <p>
                  <strong>ID:</strong> {vote.id}
                </p>
                <p>
                  <strong>제목:</strong>{' '}
                  {typeof vote.title === 'string'
                    ? vote.title
                    : JSON.stringify(vote.title)}
                </p>
                <p>
                  <strong>링크:</strong>{' '}
                  <a
                    href={`/ko/vote/${vote.id}`}
                    className='text-blue-500 underline'
                  >
                    /ko/vote/{vote.id}
                  </a>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('[VoteDebugPage] 에러:', error);

    return (
      <div className='container mx-auto p-4'>
        <h1 className='text-2xl font-bold mb-4 text-red-600'>
          투표 데이터 로드 에러
        </h1>
        <div className='bg-red-50 border border-red-200 rounded p-4'>
          <p className='text-red-800'>에러가 발생했습니다:</p>
          <pre className='text-red-600 text-sm mt-2 overflow-auto'>
            {error instanceof Error ? error.message : '알 수 없는 에러'}
          </pre>
        </div>
      </div>
    );
  }
}
