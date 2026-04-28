'use client';

import { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

// 실시간 카운트 애니메이션
export interface AnimatedCountProps {
  value: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
  locale?: string;
}

export function AnimatedCount({
  value,
  duration = 0.8,
  className = '',
  prefix = '',
  suffix = '',
  locale = 'en-US'
}: AnimatedCountProps) {
  // SSR / CSR first render 일치 보장을 위해 mount 전엔 plain span 으로
  // 정적 숫자만 출력. mount 후에야 framer-motion spring 으로 transition.
  // motion.span 의 initial/animate transform 과 useTransform display 가
  // SSR HTML 에 없는 attribute 를 추가해 hydration mismatch 를 일으키므로.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const springValue = useSpring(value, {
    duration: duration * 1000,
    bounce: 0.1
  });
  const display = useTransform(springValue, (latest) =>
    Math.floor(latest).toLocaleString(locale)
  );

  useEffect(() => {
    springValue.set(value);
  }, [springValue, value]);

  if (!mounted) {
    return (
      <span className={className}>
        {prefix}
        {Math.floor(value).toLocaleString(locale)}
        {suffix}
      </span>
    );
  }

  return (
    <motion.span
      className={className}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 0.3 }}
      key={value}
    >
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </motion.span>
  );
}

// 실시간 상태 펄스 애니메이션
export interface RealtimePulseProps {
  isActive: boolean;
  children: React.ReactNode;
  className?: string;
}

export function RealtimePulse({
  isActive,
  children,
  className = ''
}: RealtimePulseProps) {
  return (
    <motion.div
      className={`relative ${className}`}
      animate={isActive ? {
        boxShadow: [
          "0 0 0 0 rgba(59, 130, 246, 0.4)",
          "0 0 0 10px rgba(59, 130, 246, 0)",
        ]
      } : {}}
      transition={{
        duration: 1.5,
        repeat: isActive ? Infinity : 0,
        ease: "easeOut"
      }}
    >
      {children}
    </motion.div>
  );
}

// 진행률 바 애니메이션 (Framer Motion 버전)
export interface MotionProgressBarProps {
  percentage: number;
  duration?: number;
  className?: string;
  color?: string;
  showShimmer?: boolean;
}

export function MotionProgressBar({
  percentage,
  duration = 1.2,
  className = '',
  color = 'bg-blue-500',
  showShimmer = true
}: MotionProgressBarProps) {
  return (
    <div className={`relative w-full bg-gray-200 rounded-full h-2 overflow-hidden ${className}`}>
      <motion.div
        className={`h-full ${color} relative overflow-hidden`}
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{
          duration,
          type: "spring" as const,
          stiffness: 100,
          damping: 20
        }}
      >
        {showShimmer && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent skew-x-12"
            animate={{ x: ["-100%", "100%"] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "linear",
              delay: duration
            }}
          />
        )}
      </motion.div>
    </div>
  );
}

// Barrel re-exports from extracted modules
export { AnimatedVoteItem, AnimatedVoteList, VoteSkeleton } from './AnimatedVoteComponents';
export type { AnimatedVoteItemProps, AnimatedVoteListProps, VoteSkeletonProps } from './AnimatedVoteComponents';
export { ConnectionStatus } from './ConnectionStatus';
export type { ConnectionStatusProps } from './ConnectionStatus';
