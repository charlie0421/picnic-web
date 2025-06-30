'use client';

export default function DebugEnvPage() {

  const clearAllStorage = () => {
    localStorage.clear();
    sessionStorage.clear();
    console.log('모든 스토리지 데이터가 삭제되었습니다.');
    window.location.reload();
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🔍 환경변수 및 Supabase 클라이언트 디버깅 페이지</h1>
      
      <div className="space-y-6">
        <div className="bg-gray-100 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">Next.js 환경변수 (클라이언트)</h2>
          <div className="space-y-2 font-mono text-sm">
            <div>
              <strong>NEXT_PUBLIC_SUPABASE_URL:</strong> 
              <span className="text-blue-600">{process.env.NEXT_PUBLIC_SUPABASE_URL || 'undefined'}</span>
            </div>
            <div>
              <strong>NEXT_PUBLIC_SUPABASE_ANON_KEY:</strong> 
              <span className="text-blue-600">{process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '설정됨' : 'undefined'}</span>
            </div>
            <div>
              <strong>NEXT_PUBLIC_SUPABASE_STORAGE_URL:</strong> 
              <span className="text-blue-600">{process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL || 'undefined'}</span>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">🔍 현재 환경 감지</h2>
          <div className="space-y-2 font-mono text-sm">
            <div>
              <strong>현재 호스트:</strong> 
              <span className="text-green-600">{typeof window !== 'undefined' ? window.location.hostname : 'unknown'}</span>
            </div>
            <div>
              <strong>현재 URL:</strong> 
              <span className="text-green-600">{typeof window !== 'undefined' ? window.location.href : 'unknown'}</span>
            </div>
            <div>
              <strong>개발 환경:</strong> 
              <span className="text-green-600">{process.env.NODE_ENV}</span>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">🗄️ localStorage 데이터</h2>
          <div className="space-y-2 font-mono text-sm max-h-40 overflow-y-auto">
            {typeof window !== 'undefined' && Object.keys(localStorage).length > 0 ? (
              Object.keys(localStorage).map((key) => (
                <div key={key} className="break-all">
                  <strong className="text-orange-600">{key}:</strong> 
                  <span className="text-gray-600 ml-2">
                    {localStorage.getItem(key)?.substring(0, 100)}
                    {(localStorage.getItem(key)?.length || 0) > 100 ? '...' : ''}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-gray-500">localStorage가 비어있습니다.</div>
            )}
          </div>
        </div>

        <div className="bg-red-50 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">🧹 스토리지 정리</h2>
          <button 
            onClick={clearAllStorage}
            className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
          >
            모든 localStorage & sessionStorage 삭제
          </button>
          <p className="text-sm text-gray-600 mt-2">
            ⚠️ 이 버튼을 클릭하면 모든 브라우저 저장 데이터가 삭제되고 페이지가 새로고침됩니다.
          </p>
        </div>

        <div className="bg-gray-50 p-4 rounded">
          <h2 className="text-lg font-semibold mb-2">📋 테스트 단계</h2>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>위의 <strong>&quot;Supabase Client URL&quot;</strong>과 <strong>&quot;Supabase Auth URL&quot;</strong> 확인</li>
            <li>localStorage 정리 버튼 클릭</li>
            <li>메인 페이지로 이동해서 카카오톡 로그인 시도</li>
            <li>Network 탭에서 OAuth URL의 redirect_uri 확인</li>
          </ol>
        </div>
      </div>
    </div>
  );
} 