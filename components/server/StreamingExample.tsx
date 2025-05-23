/**
 * 스트리밍 예제 컴포넌트
 *
 * React Suspense와 서버 컴포넌트를 활용하여 점진적 스트리밍 렌더링을 구현합니다.
 */

import React, { Suspense } from 'react';
import { getVotes } from '@/lib/data-fetching/vote-service';
import { getRewards } from '@/utils/api/queries';
import { getMedias } from '@/utils/api/queries';
import { LoadingState } from '@/components/server';
import { Reward, Vote, Media } from '@/types/interfaces';

/**
 * 지연된 비동기 함수
 *
 * 일정 시간 후에 결과를 반환하는 헬퍼 함수입니다.
 */
async function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(value);
    }, ms);
  });
}

/**
 * 의도적으로 지연된 데이터 로딩 함수
 *
 * 이 함수는 데이터를 로드한 후 의도적으로 지연시킴으로써
 * 스트리밍 렌더링 효과를 명확하게 보여줍니다.
 */
async function fetchWithDelay<T>(
  loader: () => Promise<T>,
  ms: number,
): Promise<T> {
  const data = await loader();
  await delay(ms, null);
  return data;
}

/**
 * 투표 데이터 컴포넌트
 */
async function VoteSection() {
  const votes = await fetchWithDelay<Vote[]>(() => getVotes('ongoing'), 1000);

  return (
    <section className='bg-white p-6 rounded-lg shadow-md'>
      <h2 className='text-xl font-bold mb-4'>인기 투표</h2>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {votes.slice(0, 4).map((vote: Vote) => (
          <div key={vote.id} className='border rounded-md p-4'>
            <h3 className='font-medium'>
              {typeof vote.title === 'string'
                ? vote.title
                : vote.title && typeof vote.title === 'object'
                ? (vote.title as any)?.ko || (vote.title as any)?.en || '투표'
                : '투표'}
            </h3>
            <p className='text-sm text-gray-500 mt-2'>
              참여자:{' '}
              {vote.voteItem?.reduce(
                (sum: number, item: any) => sum + (item.voteTotal || 0),
                0,
              ) || 0}
              명
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 리워드 데이터 컴포넌트
 */
async function RewardSection() {
  const rewards = await fetchWithDelay<Reward[]>(async () => {
    const result = await getRewards();
    return result;
  }, 3000);

  return (
    <section className='bg-white p-6 rounded-lg shadow-md'>
      <h2 className='text-xl font-bold mb-4'>추천 리워드</h2>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {rewards.slice(0, 4).map((reward: Reward) => (
          <div key={reward.id} className='border rounded-md p-4'>
            <h3 className='font-medium'>
              {typeof reward.title === 'string'
                ? reward.title
                : reward.title && typeof reward.title === 'object'
                ? (reward.title as any)?.ko ||
                  (reward.title as any)?.en ||
                  '리워드'
                : '리워드'}
            </h3>
            <p className='text-sm text-gray-500 mt-2'>
              {reward.price
                ? `${reward.price.toLocaleString()}원`
                : '가격 정보 없음'}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 미디어 데이터 컴포넌트
 */
async function MediaSection() {
  const medias = await fetchWithDelay<Media[]>(async () => {
    const result = await getMedias();
    return result;
  }, 5000);

  return (
    <section className='bg-white p-6 rounded-lg shadow-md'>
      <h2 className='text-xl font-bold mb-4'>추천 미디어</h2>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        {medias.slice(0, 4).map((media: Media) => (
          <div key={media.id} className='border rounded-md p-4'>
            <h3 className='font-medium'>
              {typeof media.title === 'string'
                ? media.title
                : media.title && typeof media.title === 'object'
                ? String(media.title)
                : '미디어'}
            </h3>
            <p className='text-sm text-gray-500 mt-2'>
              {new Date(media.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 메인 스트리밍 예제 컴포넌트
 *
 * 각 섹션을 Suspense로 감싸서 점진적으로 로딩합니다.
 */
export default function StreamingExample() {
  return (
    <div className='container mx-auto p-6 space-y-8'>
      <div className='max-w-4xl mx-auto'>
        <h1 className='text-3xl font-bold mb-8'>스트리밍 서버 컴포넌트 예제</h1>

        <p className='text-gray-600 mb-6'>
          이 페이지는 React Suspense와 Next.js 서버 컴포넌트를 사용한 스트리밍
          렌더링의 예제입니다. 각 섹션은 의도적으로 지연된 시간을 가지고 있어
          점진적 로딩을 시연합니다.
        </p>

        <div className='space-y-8'>
          {/* 투표 섹션 - 1초 지연 */}
          <Suspense
            fallback={
              <LoadingState message='투표 데이터 로딩 중...' size='medium' />
            }
          >
            <VoteSection />
          </Suspense>

          {/* 리워드 섹션 - 3초 지연 */}
          <Suspense
            fallback={
              <LoadingState message='리워드 데이터 로딩 중...' size='medium' />
            }
          >
            <RewardSection />
          </Suspense>

          {/* 미디어 섹션 - 5초 지연 */}
          <Suspense
            fallback={
              <LoadingState message='미디어 데이터 로딩 중...' size='medium' />
            }
          >
            <MediaSection />
          </Suspense>
        </div>

        <div className='mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200'>
          <h3 className='text-lg font-semibold text-blue-700'>
            스트리밍 렌더링 이점
          </h3>
          <ul className='mt-2 list-disc list-inside text-blue-600 space-y-1'>
            <li>
              사용자는 전체 페이지가 로드될 때까지 기다리지 않고 콘텐츠를 볼 수
              있습니다.
            </li>
            <li>
              중요한 콘텐츠를 먼저 표시하고, 덜 중요한 콘텐츠는 나중에 로드할 수
              있습니다.
            </li>
            <li>페이지 인터랙티브 시간(TTI)을 개선할 수 있습니다.</li>
            <li>
              서버 오류가 발생해도 부분적으로 정상 콘텐츠를 표시할 수 있습니다.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
