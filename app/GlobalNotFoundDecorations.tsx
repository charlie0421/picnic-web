'use client';

import React from 'react';

/**
 * 글로벌 Not Found 페이지의 배경 애니메이션 데코레이션
 *
 * 반짝이는 이모지, 떠다니는 도형, CSS 키프레임 애니메이션(pulse, float, sparkle)을 포함합니다.
 * 404 숫자가 pulse 애니메이션을 사용하므로 style jsx가 이 래퍼 안에 있어야 합니다.
 */
export default function GlobalNotFoundDecorations({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: '#ffffff',
        color: '#333333',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* 반짝이는 배경 이모지들 */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        zIndex: 1
      }}>
        {['⭐', '🌟', '✨', '💫', '⭐'].map((emoji, index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              fontSize: '2rem',
              animation: `sparkle 3s ease-in-out infinite ${index * 0.6}s`,
              left: `${20 + index * 15}%`,
              top: `${10 + index * 20}%`
            }}
          >
            {emoji}
          </div>
        ))}
      </div>

      {/* 떠다니는 도형들 */}
      {[...Array(6)].map((_, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            width: `${30 + index * 10}px`,
            height: `${30 + index * 10}px`,
            backgroundColor: index % 2 === 0 ? '#DEB887' : '#CD853F',
            borderRadius: index % 3 === 0 ? '50%' : index % 3 === 1 ? '0%' : '20%',
            animation: `float 6s ease-in-out infinite ${index * 1.2}s`,
            left: `${10 + index * 15}%`,
            top: `${15 + index * 12}%`,
            opacity: 0.6,
            zIndex: 0
          }}
        />
      ))}

      {children}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }

        @keyframes sparkle {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
