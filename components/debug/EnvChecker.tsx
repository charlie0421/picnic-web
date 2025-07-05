'use client';

import { useEffect, useState } from 'react';

export default function EnvChecker() {
  const [envStatus, setEnvStatus] = useState<any>({});

  useEffect(() => {
    // Next.js 환경변수 확인
    const status = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT_FOUND',
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'NOT_FOUND',
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'NOT_FOUND',
      nodeEnv: process.env.NODE_ENV || 'NOT_FOUND',
      // 전체 process.env 출력 (개발 환경에서만)
      allEnvs: typeof process !== 'undefined' ? Object.keys(process.env || {}).filter(key => key.startsWith('NEXT_PUBLIC_')) : []
    };

    setEnvStatus(status);
    console.log('🔍 [EnvChecker] 환경변수 상태:', status);
  }, []);

  if (process.env.NODE_ENV === 'production') {
    return null; // 프로덕션에서는 표시하지 않음
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      background: '#000',
      color: '#fff',
      padding: '10px',
      borderRadius: '5px',
      fontSize: '12px',
      zIndex: 9999,
      maxWidth: '300px'
    }}>
      <h4>🔍 환경변수 디버그</h4>
      <div>Supabase URL: {envStatus.supabaseUrl?.substring(0, 30)}...</div>
      <div>API Key: {envStatus.supabaseKey?.substring(0, 20)}...</div>
      <div>Site URL: {envStatus.siteUrl}</div>
      <div>ENV: {envStatus.nodeEnv}</div>
      <div>Public ENVs: {envStatus.allEnvs?.length || 0}개</div>
      {envStatus.allEnvs?.length > 0 && (
        <details>
          <summary>전체 환경변수</summary>
          {envStatus.allEnvs.map((key: string) => (
            <div key={key}>{key}</div>
          ))}
        </details>
      )}
    </div>
  );
} 