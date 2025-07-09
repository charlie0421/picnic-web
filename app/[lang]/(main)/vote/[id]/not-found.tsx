import Link from 'next/link';

/**
 * 투표 상세 페이지의 Not Found 컴포넌트
 * 
 * 투표 데이터를 찾을 수 없을 때 간단한 404 메시지를 표시합니다.
 */
export default function VoteNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">투표를 찾을 수 없습니다</h2>
        <p className="text-gray-600 mb-8">요청하신 투표가 존재하지 않거나 삭제되었습니다.</p>
        <div className="space-x-4">
          <Link 
            href="/ko/vote" 
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            투표 목록으로
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