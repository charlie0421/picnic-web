'use client';

import { AuthGuardExamples } from '@/components/ui/Dialog/examples/AuthGuardExamples';

export default function TestRedirectPage() {
  return (
    <div className='container mx-auto py-6 max-w-4xl'>
      <h1 className='text-3xl font-bold mb-8 text-center'>
        리다이렉트 플로우 테스트
      </h1>

      {/* 테스트 가이드 */}
      <div className='mb-8 p-6 bg-blue-50 rounded-lg border border-blue-200'>
        <h2 className='text-xl font-semibold mb-4 text-blue-800'>
          🧪 테스트 가이드
        </h2>
        <div className='space-y-4 text-sm'>
          <div>
            <h3 className='font-semibold text-blue-700'>
              1. 기본 리다이렉트 플로우 테스트
            </h3>
            <ol className='list-decimal list-inside ml-4 space-y-1 text-blue-600'>
              <li>로그아웃 상태인지 확인</li>
              <li>&ldquo;투표하기 (인증 필요)&rdquo; 버튼 클릭</li>
              <li>로그인 필요 다이얼로그 확인</li>
              <li>
                &ldquo;로그인하기&rdquo; 버튼 클릭하여 로그인 페이지로 이동
              </li>
              <li>소셜 로그인 완료</li>
              <li>이 페이지로 자동 리다이렉트되는지 확인</li>
            </ol>
          </div>

          <div>
            <h3 className='font-semibold text-blue-700'>
              2. 실제 투표 페이지 테스트
            </h3>
            <ol className='list-decimal list-inside ml-4 space-y-1 text-blue-600'>
              <li>&ldquo;실제 투표 페이지로 이동&rdquo; 버튼 클릭</li>
              <li>투표 페이지에서 투표 시도</li>
              <li>로그인 필요 다이얼로그 확인</li>
              <li>로그인 완료 후 투표 페이지로 돌아오는지 확인</li>
            </ol>
          </div>

          <div>
            <h3 className='font-semibold text-blue-700'>3. 수동 URL 테스트</h3>
            <ol className='list-decimal list-inside ml-4 space-y-1 text-blue-600'>
              <li>&ldquo;테스트 리다이렉트 URL 설정&rdquo; 버튼 클릭</li>
              <li>SessionStorage에 URL이 저장되는지 확인</li>
              <li>로그인 페이지로 이동</li>
              <li>로그인 후 설정된 URL로 이동하는지 확인</li>
            </ol>
          </div>
        </div>
      </div>

      {/* 브라우저 개발자 도구 가이드 */}
      <div className='mb-8 p-6 bg-green-50 rounded-lg border border-green-200'>
        <h2 className='text-xl font-semibold mb-4 text-green-800'>
          🔍 개발자 도구 확인사항
        </h2>
        <div className='space-y-2 text-sm text-green-600'>
          <div>
            <strong>Console 탭:</strong> AuthRedirectHandler의 로깅 메시지 확인
          </div>
          <div>
            <strong>Application 탭:</strong> SessionStorage의 auth_redirect_url
            확인
          </div>
          <div>
            <strong>Network 탭:</strong> 로그인 요청/응답 확인
          </div>
          <div>
            <strong>아래 디버깅 정보:</strong> 실시간 상태 변화 모니터링
          </div>
        </div>
      </div>

      {/* 예상 로그 메시지 */}
      <div className='mb-8 p-6 bg-yellow-50 rounded-lg border border-yellow-200'>
        <h2 className='text-xl font-semibold mb-4 text-yellow-800'>
          📝 예상 콘솔 로그
        </h2>
        <div className='space-y-1 text-xs font-mono bg-gray-900 text-green-400 p-4 rounded'>
          <div>리다이렉트 URL 저장: /ko/test-redirect</div>
          <div>로그인 페이지로 이동</div>
          <div>🔄 로그인 성공 감지 - 리다이렉트 처리 시작</div>
          <div>📍 저장된 리다이렉트 URL: /ko/test-redirect</div>
          <div>✅ 유효한 리다이렉트 URL로 이동: /ko/test-redirect</div>
          <div>🚀 리다이렉트 실행: /ko/test-redirect</div>
        </div>
      </div>

      <AuthGuardExamples />
    </div>
  );
}
