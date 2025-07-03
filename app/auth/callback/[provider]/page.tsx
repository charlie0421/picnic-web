'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

interface CallbackPageProps {
  params: { provider: string };
}

export default function CallbackPage({ params }: CallbackPageProps) {
  const [status, setStatus] = useState('인증 처리 중...');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClientComponentClient();

  useEffect(() => {
    console.log('🚀 [AuthCallback] 클라이언트 컴포넌트 시작', { 
      provider: params.provider,
      url: window.location.href,
      searchParams: Object.fromEntries(searchParams.entries())
    });

    const handleAuth = async () => {
      try {
        setStatus('OAuth 콜백 처리 중...');
        
        // URL에서 코드 파라미터 확인
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        
        if (error) {
          throw new Error(`OAuth 에러: ${error}`);
        }
        
        if (!code) {
          throw new Error('인증 코드를 찾을 수 없습니다.');
        }

        console.log('🔑 [AuthCallback] 인증 코드 확인됨:', code.substring(0, 8) + '...');
        setStatus('세션 교환 중...');

        // Supabase 세션 교환
        const { data, error: authError } = await supabase.auth.exchangeCodeForSession(code);
        
        if (authError) {
          console.error('❌ [AuthCallback] 세션 교환 실패:', authError);
          throw authError;
        }

        if (data.session) {
          console.log('✅ [AuthCallback] 인증 성공:', data.session.user?.email);
          setStatus('로그인 완료! 리다이렉트 중...');
          
          // 성공적으로 로그인 완료
          await new Promise(resolve => setTimeout(resolve, 1000));
          router.push('/');
        } else {
          throw new Error('세션을 생성할 수 없습니다.');
        }
        
      } catch (error: any) {
        console.error('❌ [AuthCallback] 인증 처리 실패:', error);
        setError(error.message || '인증 처리 중 오류가 발생했습니다.');
        setStatus('인증 실패');
      }
    };

    handleAuth();
  }, [params.provider, searchParams, router, supabase.auth]);

  // 수동 완료 처리 함수
  const goToHome = () => {
    console.log('🔧 [AuthCallback] 홈으로 이동');
    router.push('/');
  };

  return (
    <>
      <style jsx>{`
        .container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          padding: 20px;
          font-family: Arial, sans-serif;
          background: #f9fafb;
        }
        .card {
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 40px;
          text-align: center;
          max-width: 400px;
          width: 100%;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .title {
          font-size: 24px;
          margin-bottom: 20px;
          color: #333;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid #f0f0f0;
          border-top: 3px solid #007bff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 20px auto;
        }
        .status {
          font-size: 16px;
          color: #666;
          margin-bottom: 20px;
        }
        .error-icon {
          font-size: 48px;
          color: #dc3545;
          margin-bottom: 20px;
        }
        .error-text {
          font-size: 16px;
          color: #dc3545;
          margin-bottom: 20px;
        }
        .button {
          background-color: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          margin-top: 10px;
        }
        .button:hover {
          background-color: #0056b3;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      
      <div className="container">
        <div className="card">
          <h1 className="title">
            {params.provider.toUpperCase()} 로그인
          </h1>
          
          {!error ? (
            <>
              <div className="spinner" />
              <p className="status">{status}</p>
            </>
          ) : (
            <>
              <div className="error-icon">⚠️</div>
              <p className="error-text">{error}</p>
            </>
          )}
          
          <button className="button" onClick={goToHome}>
            홈으로 이동
          </button>
        </div>
      </div>
    </>
  );
}
