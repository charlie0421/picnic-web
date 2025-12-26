import GoongHapDetailClient from './GoongHapDetailClient';

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

export default async function GoongHapDetailPage({ params }: PageProps) {
  const { id, lang } = await params;

  // 서버에서 데이터 로드하지 않음 - 클라이언트에서 캐시 우선 사용
  // 이렇게 하면 목록에서 상세로 이동 시 캐시된 데이터로 즉시 렌더링
  return (
    <GoongHapDetailClient
      initialData={null}
      id={id}
      lang={lang}
    />
  );
}
