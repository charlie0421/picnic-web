import { NotFoundState } from '@/components/server';

/**
 * 미디어 페이지의 Not Found 컴포넌트
 * 
 * 미디어 데이터를 찾을 수 없을 때 사용자에게 친절한 메시지를 표시합니다.
 */
export default function MediaNotFound() {
  return (
    <NotFoundState 
      title="미디어를 찾을 수 없습니다"
      message="요청하신 미디어 콘텐츠가 존재하지 않거나 삭제되었습니다."
      backLink="/media"
      backLabel="미디어 목록으로 돌아가기"
    />
  );
} 