'use client';

import dynamic from 'next/dynamic';
import VoteDetailSkeleton from '@/components/server/VoteDetailSkeleton';
import type { VoteDetailPresenterProps } from './vote-detail-types';

// SSR 을 끄는 이유: 모바일 브라우저(UC/Vivo/번역기/광고차단기 등)가
// SSR HTML 직후 client mount 사이에 DOM 을 변형하면 React 19 가
// hydration mismatch 로 throw → Sentry PICNIC-WEB-5C 가 반복 발생.
// 데이터 prefetch 는 server fetcher 가 그대로 처리하므로
// Presenter 만 client-only 로 마운트해 mismatch 자체를 제거한다.
const VoteDetailPresenter = dynamic(
  () => import('./VoteDetailPresenter'),
  { ssr: false, loading: () => <VoteDetailSkeleton /> },
);

export default function VoteDetailClientOnly(props: VoteDetailPresenterProps) {
  return <VoteDetailPresenter {...props} />;
}
