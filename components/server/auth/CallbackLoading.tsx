// components/server/auth/CallbackLoading.tsx
import React from 'react';

/**
 * 인증 콜백 전용 로딩 UI 컴포넌트.
 * 모든 스타일과 애니메이션을 인라인으로 직접 적용하여 모든 외부 의존성과 캐시 문제를 해결합니다.
 */
export default function CallbackLoading() {
  const animationStyles = `
    @keyframes scale-pulse-auth {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.1); opacity: 0.9; }
    }
    .animate-scale-pulse-auth {
      animation: scale-pulse-auth 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  `;

  const wrapperStyle: React.CSSProperties = {
    position: 'fixed',
    top: '0',
    right: '0',
    bottom: '0',
    left: '0',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)', // for Safari
  };

  const imageStyle: React.CSSProperties = {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    objectFit: 'cover',
    filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))',
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: animationStyles }} />
      <div style={wrapperStyle}>
        <img
          src="/images/logo.png"
          alt="Picnic Loading"
          style={imageStyle}
          className="animate-scale-pulse-auth" // 애니메이션 클래스는 <style> 태그를 통해 적용
        />
      </div>
    </>
  );
}
