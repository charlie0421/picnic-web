'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { VoteItem } from '@/types/interfaces';

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

// 랭킹 변경 애니메이션을 위한 래퍼
export interface AnimatedVoteItemProps {
  item: VoteItem & { 
    isNew?: boolean; 
    isUpdated?: boolean; 
    rankChange?: 'up' | 'down' | 'same' | 'new';
    _realtimeInfo?: {
      isHighlighted?: boolean;
      rankChange?: 'up' | 'down' | 'same' | 'new';
      isNew?: boolean;
      isUpdated?: boolean;
    };
  };
  rank: number;
  children: React.ReactNode;
  className?: string;
}

export function AnimatedVoteItem({ 
  item, 
  rank, 
  children, 
  className = '' 
}: AnimatedVoteItemProps) {
  const realtimeInfo = item._realtimeInfo;
  const isHighlighted = realtimeInfo?.isHighlighted || item.isUpdated;
  const rankChange = realtimeInfo?.rankChange || item.rankChange;
  const isNew = realtimeInfo?.isNew || item.isNew;

  // 랭킹 변경에 따른 애니메이션 설정
  const getRankChangeAnimation = () => {
    switch (rankChange) {
      case 'up':
        return {
          initial: { y: 10, scale: 0.98 },
          animate: { y: 0, scale: 1 },
          transition: { type: "spring" as const, stiffness: 400, damping: 25 }
        };
      case 'down':
        return {
          initial: { y: -10, scale: 0.98 },
          animate: { y: 0, scale: 1 },
          transition: { type: "spring" as const, stiffness: 400, damping: 25 }
        };
      case 'new':
        return {
          initial: { opacity: 0, scale: 0.8, x: -20 },
          animate: { opacity: 1, scale: 1, x: 0 },
          transition: { type: "spring" as const, stiffness: 500, damping: 30 }
        };
      default:
        return {
          initial: { scale: 1 },
          animate: { scale: isHighlighted ? [1, 1.02, 1] : 1 },
          transition: { duration: 0.3 }
        };
    }
  };

  return (
    <motion.div
      layout
      layoutId={`vote-item-${item.id}`}
      className={`relative ${className}`}
      {...getRankChangeAnimation()}
    >
      {/* 하이라이트 배경 */}
      <AnimatePresence>
        {isHighlighted && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200"
          />
        )}
      </AnimatePresence>

      {/* 랭킹 변경 인디케이터 */}
      <AnimatePresence>
        {rankChange && rankChange !== 'same' && (
          <motion.div
            initial={{ opacity: 0, scale: 0, rotate: -180 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0, rotate: 180 }}
            transition={{ type: "spring" as const, stiffness: 600, damping: 25 }}
            className="absolute -top-2 -right-2 z-10"
          >
            {rankChange === 'up' && (
              <div className="bg-green-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                ↗️
              </div>
            )}
            {rankChange === 'down' && (
              <div className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                ↘️
              </div>
            )}
            {rankChange === 'new' && (
              <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                🆕
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 실제 컨텐츠 */}
      <div className="relative z-[1]">
        {children}
      </div>
    </motion.div>
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

// 스켈레톤 로딩 애니메이션
export interface VoteSkeletonProps {
  count?: number;
  className?: string;
}

export function VoteSkeleton({ 
  count = 5, 
  className = '' 
}: VoteSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="p-4 border rounded-lg"
        >
          <div className="flex items-center space-x-4">
            {/* 아바타 스켈레톤 */}
            <motion.div
              className="w-12 h-12 bg-gray-200 rounded-full"
              animate={{ 
                backgroundColor: ["#e5e7eb", "#f3f4f6", "#e5e7eb"] 
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
            
            <div className="flex-1 space-y-2">
              {/* 이름 스켈레톤 */}
              <motion.div
                className="h-4 bg-gray-200 rounded w-1/3"
                animate={{ 
                  backgroundColor: ["#e5e7eb", "#f3f4f6", "#e5e7eb"] 
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 0.2
                }}
              />
              
              {/* 진행률 바 스켈레톤 */}
              <motion.div
                className="h-2 bg-gray-200 rounded w-full"
                animate={{ 
                  backgroundColor: ["#e5e7eb", "#f3f4f6", "#e5e7eb"] 
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity, 
                  ease: "easeInOut",
                  delay: 0.4
                }}
              />
            </div>
            
            {/* 투표 수 스켈레톤 */}
            <motion.div
              className="h-6 bg-gray-200 rounded w-16"
              animate={{ 
                backgroundColor: ["#e5e7eb", "#f3f4f6", "#e5e7eb"] 
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0.6
              }}
            />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// 순위 변경 목록 애니메이션
export interface AnimatedVoteListProps {
  items: (VoteItem & { 
    isNew?: boolean; 
    isUpdated?: boolean; 
    rankChange?: 'up' | 'down' | 'same' | 'new';
    _realtimeInfo?: any;
  })[];
  renderItem: (item: any, index: number) => React.ReactNode;
  className?: string;
}

export function AnimatedVoteList({ 
  items, 
  renderItem, 
  className = '' 
}: AnimatedVoteListProps) {
  return (
    <motion.div layout className={className}>
      <AnimatePresence mode="popLayout">
        {items.map((item, index) => (
          <AnimatedVoteItem
            key={item.id}
            item={item}
            rank={index + 1}
            className="mb-3"
          >
            {renderItem(item, index)}
          </AnimatedVoteItem>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// 실시간 연결 상태 애니메이션
export interface ConnectionStatusProps {
  status: 'connecting' | 'connected' | 'disconnected' | 'error' | 'network_error' | 'reconnecting' | 'suspended';
  className?: string;
}

export function ConnectionStatus({ 
  status, 
  className = '' 
}: ConnectionStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          color: 'bg-green-500',
          text: '연결됨',
          icon: '🟢',
          pulse: false
        };
      case 'connecting':
        return {
          color: 'bg-yellow-500',
          text: '연결 중...',
          icon: '🟡',
          pulse: true
        };
      case 'reconnecting':
        return {
          color: 'bg-blue-500',
          text: '재연결 중...',
          icon: '🔄',
          pulse: true
        };
      case 'disconnected':
        return {
          color: 'bg-gray-500',
          text: '연결 안됨',
          icon: '⚪',
          pulse: false
        };
      case 'network_error':
        return {
          color: 'bg-orange-500',
          text: '네트워크 오류',
          icon: '📡',
          pulse: true
        };
      case 'suspended':
        return {
          color: 'bg-gray-400',
          text: '일시 중단',
          icon: '⏸️',
          pulse: false
        };
      case 'error':
        return {
          color: 'bg-red-500',
          text: '연결 오류',
          icon: '🔴',
          pulse: true
        };
    }
  };

  const config = getStatusConfig();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`flex items-center space-x-2 ${className}`}
    >
      <motion.div
        className={`w-2 h-2 rounded-full ${config.color}`}
        animate={config.pulse ? {
          scale: [1, 1.2, 1],
          opacity: [1, 0.7, 1]
        } : {}}
        transition={{
          duration: 1,
          repeat: config.pulse ? Infinity : 0,
          ease: "easeInOut"
        }}
      />
      <span className="text-xs text-gray-600">{config.text}</span>
    </motion.div>
  );
} 