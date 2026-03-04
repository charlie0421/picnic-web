'use client';

import React from 'react';

interface ErrorDecorationsProps {
  children: React.ReactNode;
}

/**
 * 에러 페이지 배경 장식 컴포넌트
 *
 * 떠다니는 도형, 반짝이는 이모지, CSS 애니메이션 키프레임을 제공합니다.
 * children을 감싸서 gradientShift, pulse 등의 애니메이션을 하위 요소에서도 사용할 수 있게 합니다.
 */
export default function ErrorDecorations({ children }: ErrorDecorationsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        backgroundColor: '#ffffff',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 배경 떠다니는 도형들 */}
      <div style={{ position: 'absolute', top: '10%', left: '10%', width: '80px', height: '80px', backgroundColor: '#8B4513', borderRadius: '50%', animation: 'float 6s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '20%', right: '15%', width: '60px', height: '60px', backgroundColor: '#CD853F', borderRadius: '50%', animation: 'float 8s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', bottom: '15%', left: '20%', width: '70px', height: '70px', backgroundColor: '#DEB887', borderRadius: '50%', animation: 'float 7s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', bottom: '25%', right: '10%', width: '50px', height: '50px', backgroundColor: '#D2691E', borderRadius: '50%', animation: 'float 9s ease-in-out infinite reverse' }} />
      <div style={{ position: 'absolute', top: '50%', left: '5%', width: '40px', height: '40px', backgroundColor: '#A0522D', borderRadius: '50%', animation: 'float 5s ease-in-out infinite' }} />
      <div style={{ position: 'absolute', top: '30%', right: '5%', width: '90px', height: '90px', backgroundColor: '#F4A460', borderRadius: '50%', animation: 'float 10s ease-in-out infinite reverse' }} />

      {/* 반짝이는 이모지들 */}
      <div style={{ position: 'absolute', top: '15%', left: '25%', fontSize: '30px', animation: 'sparkle 2s ease-in-out infinite' }}>💥</div>
      <div style={{ position: 'absolute', top: '25%', right: '30%', fontSize: '25px', animation: 'sparkle 2.5s ease-in-out infinite reverse' }}>🔥</div>
      <div style={{ position: 'absolute', bottom: '20%', left: '30%', fontSize: '35px', animation: 'sparkle 3s ease-in-out infinite' }}>⚡</div>
      <div style={{ position: 'absolute', bottom: '35%', right: '25%', fontSize: '28px', animation: 'sparkle 2.2s ease-in-out infinite reverse' }}>💥</div>
      <div style={{ position: 'absolute', top: '40%', left: '15%', fontSize: '32px', animation: 'sparkle 2.8s ease-in-out infinite' }}>🔥</div>

      {children}

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }

        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }

        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
