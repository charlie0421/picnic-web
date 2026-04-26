'use client';

import React from 'react';

interface NotFoundDecorationsProps {
  children: React.ReactNode;
}

/**
 * Background decorations for the Not Found page.
 *
 * Renders CSS keyframe animations (bounce, float, twinkle),
 * four floating gradient circles, and five twinkling emoji elements.
 * Wraps `children` inside a centered full-viewport container.
 */
export function NotFoundDecorations({ children }: NotFoundDecorationsProps) {
  return (
    <>
      <style jsx>{`
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
          }
          40% {
            transform: translateY(-10px);
          }
          60% {
            transform: translateY(-5px);
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-20px);
          }
        }
        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }
        .bounce {
          animation: bounce 2s infinite;
        }
        .float {
          animation: float 3s ease-in-out infinite;
        }
        .twinkle {
          animation: twinkle 1s infinite;
        }
      `}</style>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* 배경 애니메이션 요소들 */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '10%',
            width: '100px',
            height: '100px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #d2691e, #ff8c00)',
            opacity: 0.7,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            top: '20%',
            right: '15%',
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #cd853f, #daa520)',
            opacity: 0.6,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            bottom: '15%',
            left: '20%',
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #b8860b, #f4a460)',
            opacity: 0.5,
          }}
          className="float"
        />
        <div
          style={{
            position: 'absolute',
            bottom: '25%',
            right: '10%',
            width: '90px',
            height: '90px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #daa520, #ffd700)',
            opacity: 0.8,
          }}
          className="float"
        />

        {/* 반짝이는 이모지들 */}
        <div
          style={{
            position: 'absolute',
            top: '5%',
            left: '5%',
            fontSize: '24px',
          }}
          className="twinkle"
        >
          ⭐
        </div>
        <div
          style={{
            position: 'absolute',
            top: '15%',
            right: '8%',
            fontSize: '20px',
          }}
          className="twinkle"
        >
          🌟
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '10%',
            left: '8%',
            fontSize: '18px',
          }}
          className="twinkle"
        >
          ✨
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: '20%',
            right: '12%',
            fontSize: '22px',
          }}
          className="twinkle"
        >
          💫
        </div>
        <div
          style={{
            position: 'absolute',
            top: '30%',
            left: '85%',
            fontSize: '20px',
          }}
          className="twinkle"
        >
          ⭐
        </div>

        {children}
      </div>
    </>
  );
}
