import React, { Suspense } from 'react';
import Link from 'next/link';
import { Clock, Database, Zap, Eye } from 'lucide-react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Server Components Demo | Picnic',
  description: 'Next.js 13+ App Router의 Server Components와 Client Components 데모',
};

// 간단한 예제 컴포넌트들
function ServerDataComponent() {
  return (
    <div className="p-4 bg-green-100 rounded">
      <h3 className="font-semibold text-green-800">서버 데이터</h3>
      <p className="text-green-700">서버에서 미리 렌더링된 데이터입니다.</p>
      <p className="text-sm text-green-600">빌드 시간: {new Date().toISOString()}</p>
    </div>
  );
}

function ClientDataComponent() {
  return (
    <div className="p-4 bg-blue-100 rounded">
      <h3 className="font-semibold text-blue-800">클라이언트 데이터</h3>
      <p className="text-blue-700">브라우저에서 실행되는 인터랙티브 컴포넌트입니다.</p>
      <button className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm">
        클릭 가능
      </button>
    </div>
  );
}

function HybridComponent() {
  return (
    <div className="p-4 bg-purple-100 rounded">
      <h3 className="font-semibold text-purple-800">하이브리드 접근법</h3>
      <p className="text-purple-700">서버와 클라이언트 컴포넌트의 조합입니다.</p>
    </div>
  );
}

// 클라이언트 컴포넌트에서 로케일 링크 생성
function LocalizedLinks() {
  return (
    <div className="mb-8 p-6 bg-blue-50 rounded-lg">
      <h2 className="text-xl font-semibold mb-4 text-blue-900">🔗 데모 네비게이션</h2>
      <div className="space-y-2">
        <div>
          <Link href="/streaming-example" className="text-blue-600 hover:text-blue-800 underline">
            📡 Streaming Example 페이지로 이동
          </Link>
          <p className="text-sm text-gray-600">실시간 데이터 스트리밍 예제를 확인해보세요</p>
        </div>
      </div>
    </div>
  );
}

export default function ServerComponentsDemo() {
  return (
    <div className="space-y-8">
      {/* 페이지 헤더 */}
      <div className="text-center py-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          🚀 Server Components Demo
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Next.js 13+ App Router의 강력한 Server Components와 Client Components의 
          차이점과 활용법을 실제 예제로 경험해보세요
        </p>
      </div>

      {/* 네비게이션 */}
      <LocalizedLinks />

      {/* 컴포넌트 데모 섹션들 */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Server Component 데모 */}
        <div className="bg-green-50 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Database className="mr-2 h-6 w-6 text-green-600" />
            <h2 className="text-2xl font-semibold text-green-800">Server Component</h2>
          </div>
          <p className="text-green-700 mb-4">
            서버에서 실행되어 정적 HTML로 전달되는 컴포넌트
          </p>
          <div className="bg-white rounded p-4 border border-green-200">
            <Suspense fallback={
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600"></div>
                <span className="text-green-600">서버에서 데이터 로딩 중...</span>
              </div>
            }>
              <ServerDataComponent />
            </Suspense>
          </div>
          <div className="mt-4 text-sm text-green-600">
            ✅ 서버에서 미리 렌더링되어 빠른 초기 로딩<br/>
            ✅ SEO 친화적<br/>
            ✅ 번들 크기 최소화
          </div>
        </div>

        {/* Client Component 데모 */}
        <div className="bg-blue-50 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <Zap className="mr-2 h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-semibold text-blue-800">Client Component</h2>
          </div>
          <p className="text-blue-700 mb-4">
            브라우저에서 실행되어 인터랙티브한 UI를 제공하는 컴포넌트
          </p>
          <div className="bg-white rounded p-4 border border-blue-200">
            <ClientDataComponent />
          </div>
          <div className="mt-4 text-sm text-blue-600">
            ✅ 사용자 인터랙션 지원<br/>
            ✅ 실시간 데이터 업데이트<br/>
            ✅ 브라우저 API 사용 가능
          </div>
        </div>
      </div>

      {/* Hybrid Component 데모 */}
      <div className="bg-purple-50 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Eye className="mr-2 h-6 w-6 text-purple-600" />
          <h2 className="text-2xl font-semibold text-purple-800">Hybrid Approach</h2>
        </div>
        <p className="text-purple-700 mb-4">
          Server Components와 Client Components를 조합하여 최적의 성능과 UX를 제공
        </p>
        <div className="bg-white rounded p-4 border border-purple-200">
          <HybridComponent />
        </div>
        <div className="mt-4 text-sm text-purple-600">
          ✅ 서버와 클라이언트의 장점을 모두 활용<br/>
          ✅ 선택적 하이드레이션으로 성능 최적화<br/>
          ✅ 복잡한 애플리케이션에 이상적
        </div>
      </div>

      {/* 성능 비교 */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center mb-4">
          <Clock className="mr-2 h-6 w-6 text-gray-600" />
          <h2 className="text-2xl font-semibold text-gray-800">성능 특성 비교</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full bg-white border border-gray-200 rounded-lg">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">특성</th>
                <th className="px-4 py-2 text-left font-semibold text-green-700">Server Component</th>
                <th className="px-4 py-2 text-left font-semibold text-blue-700">Client Component</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t">
                <td className="px-4 py-2 font-medium">렌더링 위치</td>
                <td className="px-4 py-2 text-green-600">서버</td>
                <td className="px-4 py-2 text-blue-600">브라우저</td>
              </tr>
              <tr className="border-t bg-gray-50">
                <td className="px-4 py-2 font-medium">번들 크기</td>
                <td className="px-4 py-2 text-green-600">0KB (포함되지 않음)</td>
                <td className="px-4 py-2 text-blue-600">실제 코드 크기만큼</td>
              </tr>
              <tr className="border-t">
                <td className="px-4 py-2 font-medium">초기 로딩 속도</td>
                <td className="px-4 py-2 text-green-600">빠름</td>
                <td className="px-4 py-2 text-blue-600">상대적으로 느림</td>
              </tr>
              <tr className="border-t bg-gray-50">
                <td className="px-4 py-2 font-medium">인터랙티비티</td>
                <td className="px-4 py-2 text-red-600">불가능</td>
                <td className="px-4 py-2 text-green-600">완전 지원</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 