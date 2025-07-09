import Link from 'next/link';

/**
 * 미디어 페이지의 Not Found 컴포넌트
 * 
 * 미디어 데이터를 찾을 수 없을 때 간단한 404 메시지를 표시합니다.
 */
export default function MediaNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">미디어를 찾을 수 없습니다</h2>
        <p className="text-gray-600 mb-8">요청하신 미디어가 존재하지 않거나 삭제되었습니다.</p>
        <div className="space-x-4">
          <Link 
            href="/ko/media" 
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            미디어 목록으로
          </Link>
          <Link 
            href="/ko" 
            className="inline-block px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
} 