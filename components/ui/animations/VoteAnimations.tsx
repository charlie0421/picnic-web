'use client';

import React, { useEffect, useState } from 'react';

// 투표 제출 성공 애니메이션
export interface VoteSubmitSuccessProps {
  isVisible: boolean;
  onComplete: () => void;
  message?: string;
}

export function VoteSubmitSuccess({ 
  isVisible, 
  onComplete, 
  message = '투표가 완료되었습니다!' 
}: VoteSubmitSuccessProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(onComplete, 300); // 애니메이션 완료 후 콜백
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onComplete]);

  if (!isVisible && !isAnimating) return null;

  return (
    <div 
      className={`fixed inset-0 flex items-center justify-center z-50 bg-black/50 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div 
        className={`bg-white rounded-2xl p-8 mx-4 max-w-sm w-full text-center shadow-2xl transition-all duration-500 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-75 translate-y-4'
        }`}
      >
        {/* 체크마크 애니메이션 */}
        <div className={`w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 transition-all duration-700 ${
          isVisible ? 'scale-100' : 'scale-0'
        }`}>
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
              className={`transition-all duration-1000 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
            />
          </svg>
        </div>

        <h3 className={`text-lg font-bold text-gray-900 mb-2 transition-all duration-300 delay-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>
          투표 완료!
        </h3>

        <p className={`text-gray-600 transition-all duration-300 delay-700 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}>
          {message}
        </p>
      </div>
    </div>
  );
}

// 투표 카운트 증가 애니메이션
export interface CountUpAnimationProps {
  value: number;
  duration?: number;
  className?: string;
}

export function CountUpAnimation({ 
  value, 
  duration = 1000, 
  className = '' 
}: CountUpAnimationProps) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    const diff = value - startValue;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // easeOut 효과
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.floor(startValue + diff * easeOut);
      
      setDisplayValue(currentValue);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <span className={className}>
      {displayValue.toLocaleString()}
    </span>
  );
}

// 진행률 바 애니메이션
export interface AnimatedProgressBarProps {
  percentage: number;
  duration?: number;
  className?: string;
  showLabel?: boolean;
  color?: string;
}

export function AnimatedProgressBar({ 
  percentage, 
  duration = 1000, 
  className = '', 
  showLabel = true,
  color = 'bg-primary'
}: AnimatedProgressBarProps) {
  const [currentPercentage, setCurrentPercentage] = useState(0);
  const [isAnimated, setIsAnimated] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPercentage(percentage);
      setIsAnimated(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <div className={`relative ${className}`}>
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full ${color} relative overflow-hidden transition-all duration-1000 ease-out`}
          style={{ width: `${currentPercentage}%` }}
        >
          {/* 반짝이는 효과 */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12 animate-shimmer" />
        </div>
      </div>
      
      {showLabel && (
        <span className={`absolute -top-8 right-0 text-sm font-medium text-gray-700 transition-all duration-300 ${
          isAnimated ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
        }`}>
          {percentage.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

// 실시간 업데이트 펄스 애니메이션
export interface LiveUpdatePulseProps {
  isActive: boolean;
  children: React.ReactNode;
  className?: string;
}

export function LiveUpdatePulse({ 
  isActive, 
  children, 
  className = '' 
}: LiveUpdatePulseProps) {
  return (
    <div className={`rounded-xl ${isActive ? 'animate-pulse-ring' : ''} ${className}`}>
      {children}
    </div>
  );
}

// 투표 아이템 호버 효과
export interface VoteItemHoverProps {
  children: React.ReactNode;
  isSelected: boolean;
  isDisabled: boolean;
  className?: string;
}

export function VoteItemHover({ 
  children, 
  isSelected, 
  isDisabled, 
  className = '' 
}: VoteItemHoverProps) {
  return (
    <div className={`relative transition-all duration-200 ${
      !isDisabled ? 'hover:scale-105 hover:-translate-y-1 hover:shadow-lg' : ''
    } ${
      isSelected ? 'scale-105 -translate-y-1 shadow-lg' : ''
    } ${className}`}>
      {children}
      
      {/* 선택된 항목 글로우 효과 */}
      {isSelected && (
        <div className="absolute inset-0 rounded-xl bg-primary/10 pointer-events-none animate-fade-in" />
      )}
    </div>
  );
}

// 결과 순위 애니메이션
export interface RankingAnimationProps {
  rank: number;
  delay?: number;
  children: React.ReactNode;
  className?: string;
}

export function RankingAnimation({ 
  rank, 
  delay = 0, 
  children, 
  className = '' 
}: RankingAnimationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay + (rank - 1) * 100);
    return () => clearTimeout(timer);
  }, [rank, delay]);

  return (
    <div className={`transition-all duration-500 ease-out ${
      isVisible ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 -translate-x-12 scale-90'
    } ${className}`}>
      {children}
    </div>
  );
}

// 로딩 스피너 (투표 관련)
export interface VoteLoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

export function VoteLoadingSpinner({ 
  size = 'md', 
  message = '투표 처리 중...', 
  className = '' 
}: VoteLoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12'
  };

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`${sizeClasses[size]} border-2 border-primary border-t-transparent rounded-full animate-spin`} />
      {message && (
        <p className="mt-2 text-sm text-gray-600 text-center animate-fade-in">
          {message}
        </p>
      )}
    </div>
  );
}

// 투표 시간 카운트다운 애니메이션
export interface TimeCountdownProps {
  timeLeft: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null;
  status: 'upcoming' | 'ongoing' | 'ended';
  className?: string;
}

export function TimeCountdown({ timeLeft, status, className = '' }: TimeCountdownProps) {
  if (status === 'ended' || !timeLeft) {
    return (
      <div className={`text-center ${className}`}>
        <span className="text-red-500 font-medium">투표가 종료되었습니다</span>
      </div>
    );
  }

  const isUrgent = timeLeft.days === 0 && timeLeft.hours < 1;

  return (
    <div className={`flex items-center justify-center space-x-2 ${className}`}>
      <span className="text-sm text-gray-600">
        {status === 'upcoming' ? '시작까지' : '종료까지'}
      </span>
      
      <div className="flex items-center space-x-1">
        {timeLeft.days > 0 && (
          <>
            <TimeUnit value={timeLeft.days} label="일" isUrgent={isUrgent} />
            <span className="text-gray-400">:</span>
          </>
        )}
        
        <TimeUnit value={timeLeft.hours} label="시" isUrgent={isUrgent} />
        <span className="text-gray-400">:</span>
        
        <TimeUnit value={timeLeft.minutes} label="분" isUrgent={isUrgent} />
        <span className="text-gray-400">:</span>
        
        <TimeUnit value={timeLeft.seconds} label="초" isUrgent={isUrgent} />
      </div>
    </div>
  );
}

function TimeUnit({ value, label, isUrgent }: { value: number; label: string; isUrgent: boolean }) {
  return (
    <div className={`flex flex-col items-center transition-all duration-300 ${
      isUrgent ? 'text-red-500' : 'text-gray-900'
    }`}>
      <span className={`text-lg font-bold leading-none ${
        isUrgent && value < 10 ? 'animate-pulse' : ''
      }`}>
        {value.toString().padStart(2, '0')}
      </span>
      <span className="text-xs opacity-75 leading-none">{label}</span>
    </div>
  );
} 