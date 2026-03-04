'use client';

import { motion } from 'framer-motion';

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
