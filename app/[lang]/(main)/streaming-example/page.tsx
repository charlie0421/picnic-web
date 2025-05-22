import { StreamingExample } from '@/components/server';
import { ClientNavigationSetter } from '@/components/client';
import { PortalType } from '@/utils/enums';

export const metadata = {
  title: '스트리밍 렌더링 예제 - 피크닉',
  description: 'Next.js의 서버 컴포넌트와 React Suspense를 활용한 스트리밍 렌더링 예제',
};

export default function StreamingExamplePage() {
  return (
    <>
      <StreamingExample />
      <ClientNavigationSetter portalType={PortalType.MEDIA} />
    </>
  );
} 