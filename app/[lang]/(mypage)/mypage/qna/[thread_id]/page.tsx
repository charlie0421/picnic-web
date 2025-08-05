import { getQnaThreadDetails } from '@/lib/data-fetching/server/qna-service';
import { getTranslations } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import QnaDetailClient from './QnaDetailClient';
import QnaSkeleton from '@/components/server/mypage/QnaSkeleton';

interface QnaDetailPageProps {
  params: Promise<{
    lang: string;
    thread_id: string;
  }>;
}

export default async function QnaDetailPage(props: QnaDetailPageProps) {
  const params = await props.params;
  const { lang, thread_id } = params;

  const threadIdNumber = Number(thread_id);
  if (isNaN(threadIdNumber)) {
    notFound();
  }

  const { data: thread, error } = await getQnaThreadDetails(threadIdNumber);

  if (error || !thread) {
    // 여기서는 notFound() 대신 에러 메시지를 보여주거나 리다이렉트 할 수 있습니다.
    // 지금은 간단하게 notFound로 처리합니다.
    notFound();
  }
  
  const t = await getTranslations(lang as any);

  return (
    <Suspense fallback={<QnaSkeleton />}>
      <QnaDetailClient 
        thread={thread}
        translations={{
            'send_message_placeholder': t('send_message_placeholder'),
            'send_button': t('send_button'),
            'file_attachment': t('file_attachment'),
            'admin_message': t('admin_message'),
        }}
      />
    </Suspense>
  );
}
