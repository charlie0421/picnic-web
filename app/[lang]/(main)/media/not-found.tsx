import UniversalNotFound from '@/components/common/UniversalNotFound';

/**
 * 미디어 페이지의 Not Found 컴포넌트
 * 
 * 미디어 데이터를 찾을 수 없을 때 사용자에게 친절한 메시지를 표시합니다.
 */
export default function MediaNotFound() {
  return (
    <UniversalNotFound 
      pageType="media"
      useGlobalLanguageDetection={false}
      showContactButton={false}
    />
  );
} 