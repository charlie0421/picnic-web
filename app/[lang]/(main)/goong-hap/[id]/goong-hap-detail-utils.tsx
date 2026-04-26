import React from 'react';

export const STAR_CANDY_COST = 100;

export function getLangCandidates(lang: string | undefined): string[] {
  const raw = String(lang || '').trim();
  if (!raw) return [];
  const lc = raw.toLowerCase();
  const base = lc.split('-')[0].split('_')[0];
  if (base === 'zh') {
    if (lc.includes('tw')) return ['zh-tw', 'zh', 'zh-cn'];
    if (lc.includes('cn') || lc.includes('hans')) return ['zh-cn', 'zh', 'zh-tw'];
    return ['zh', 'zh-cn', 'zh-tw'];
  }
  // 일반 케이스: 정확히 일치 > 베이스 언어
  if (lc !== base) return [lc, base];
  return [base];
}

export function normalizeForServer(lang: string | undefined): string {
  const lc = String(lang || '').toLowerCase();
  const base = lc.split('-')[0].split('_')[0];
  if (base === 'zh') {
    if (lc.includes('tw')) return 'zh-TW';
    if (lc.includes('cn') || lc.includes('hans')) return 'zh-CN';
    return 'zh';
  }
  return base;
}

export function FullPageSkeleton() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50'>
      <div className='px-4 py-6 sm:py-10'>
        <div className='max-w-4xl mx-auto'>
          {/* 헤더 영역 스켈레톤 */}
          <div className='mb-8'>
            <div className='flex items-center gap-4 mb-4'>
              <div className='w-10 h-10 rounded-full bg-purple-200 animate-pulse' />
              <div className='h-14 w-24 bg-gradient-to-r from-purple-200 to-pink-200 rounded animate-pulse' />
              <div className='flex flex-col gap-1'>
                <div className='h-5 w-12 bg-gray-300 rounded animate-pulse' />
                <div className='h-3 w-16 bg-gray-200 rounded animate-pulse' />
              </div>
            </div>
          </div>

          {/* 헤더 카드 스켈레톤 */}
          <div className='relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-300 via-pink-300 to-rose-300 shadow-lg'>
            <div className='px-6 py-8 sm:px-8 sm:py-10'>
              {/* 아바타들 */}
              <div className='flex items-center justify-center gap-5 sm:gap-8'>
                <div className='flex flex-col items-center'>
                  <div className='w-24 h-24 rounded-full bg-white/30 animate-pulse' />
                  <div className='mt-2 h-4 w-16 bg-white/30 rounded animate-pulse' />
                </div>
                <div className='w-10 h-10 rounded-full bg-white/30 animate-pulse' />
                <div className='flex flex-col items-center'>
                  <div className='w-24 h-24 rounded-full bg-white/30 animate-pulse' />
                  <div className='mt-2 h-4 w-12 bg-white/30 rounded animate-pulse' />
                </div>
              </div>
              {/* 점수 영역 */}
              <div className='mt-6 flex items-center justify-between'>
                <div className='h-6 w-28 bg-white/30 rounded animate-pulse' />
                <div className='text-right space-y-1'>
                  <div className='h-10 w-20 bg-white/30 rounded ml-auto animate-pulse' />
                  <div className='h-3 w-24 bg-white/30 rounded ml-auto animate-pulse' />
                </div>
              </div>
              {/* 요약 */}
              <div className='mt-4 space-y-2'>
                <div className='h-4 bg-white/30 rounded w-full animate-pulse' />
                <div className='h-4 bg-white/30 rounded w-3/4 animate-pulse' />
              </div>
            </div>
          </div>

          {/* 콘텐츠 카드들 스켈레톤 */}
          <div className='mt-6 space-y-6'>
            {[{ gradient: 'from-purple-500 to-pink-500' }, { gradient: 'from-pink-500 to-rose-500' }, { gradient: 'from-indigo-500 to-purple-500' }].map((item, i) => (
              <div key={i} className='rounded-2xl bg-white/80 backdrop-blur-sm border border-white/50 shadow-lg overflow-hidden'>
                <div className={`bg-gradient-to-r ${item.gradient} px-5 py-3`}>
                  <div className='h-5 w-20 bg-white/30 rounded animate-pulse' />
                </div>
                <div className='p-5 space-y-2'>
                  <div className='h-4 bg-gray-200 rounded w-full animate-pulse' />
                  <div className='h-4 bg-gray-200 rounded w-5/6 animate-pulse' />
                  <div className='h-4 bg-gray-200 rounded w-4/5 animate-pulse' />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
