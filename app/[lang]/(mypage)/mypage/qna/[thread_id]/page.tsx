import { getQnaThreadDetails } from '@/lib/data-fetching/server/qna-service';
import { notFound } from 'next/navigation';
import QnaDetailClient from './QnaDetailClient';

export const dynamic = 'force-dynamic';

interface QnaDetailPageProps {
  params: Promise<{
    lang: string;
    thread_id: string;
  }>;
}

export default async function QnaDetailPage(props: QnaDetailPageProps) {
  const params = await props.params;
  const { thread_id } = params;

  const threadIdNumber = Number(thread_id);
  if (isNaN(threadIdNumber)) {
    notFound();
  }

  const { data: thread, error } = await getQnaThreadDetails(threadIdNumber);

  if (error || !thread) {
    notFound();
  }

  return <QnaDetailClient thread={thread} />;
}
