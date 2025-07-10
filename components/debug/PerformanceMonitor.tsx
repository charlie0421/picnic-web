'use client';

import React, { useState, useEffect, useRef, memo } from 'react';

interface PerformanceMetrics {
  fps: number;
  memoryUsage: number;
  renderCount: number;
  loadTime: number;
  domNodes: number;
  onlineStatus: boolean;
  connectionType?: string;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showDetails?: boolean;
}

// FPS 계산을 위한 훅
function useFPS() {
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let animationId: number;

    const calculateFPS = () => {
      frameCountRef.current++;
      const now = performance.now();
      
      if (now - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }
      
      animationId = requestAnimationFrame(calculateFPS);
    };

    animationId = requestAnimationFrame(calculateFPS);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, []);

  return fps;
}

// 메모리 사용량 모니터링 훅
function useMemoryUsage() {
  const [memoryUsage, setMemoryUsage] = useState(0);

  useEffect(() => {
    const updateMemoryUsage = () => {
      if (typeof window !== 'undefined' && 'performance' in window && 'memory' in (window.performance as any)) {
        const memory = (window.performance as any).memory;
        setMemoryUsage(Math.round(memory.usedJSHeapSize / 1024 / 1024)); // MB
      }
    };

    updateMemoryUsage();
    const interval = setInterval(updateMemoryUsage, 2000);

    return () => clearInterval(interval);
  }, []);

  return memoryUsage;
}

// 네트워크 상태 모니터링 훅
function useNetworkStatus() {
  const [status, setStatus] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    connectionType: 'unknown'
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateOnlineStatus = () => {
      let connectionType = 'unknown';
      
      if ('connection' in navigator) {
        const connection = (navigator as any).connection;
        connectionType = connection?.effectiveType || connection?.type || 'unknown';
      }

      setStatus({
        isOnline: navigator.onLine,
        connectionType
      });
    };

    updateOnlineStatus();

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if ('connection' in navigator) {
      (navigator as any).connection?.addEventListener('change', updateOnlineStatus);
    }

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      
      if ('connection' in navigator) {
        (navigator as any).connection?.removeEventListener('change', updateOnlineStatus);
      }
    };
  }, []);

  return status;
}

// 렌더링 카운터 훅
function useRenderCount() {
  const renderCountRef = useRef(0);
  
  useEffect(() => {
    renderCountRef.current++;
  });

  return renderCountRef.current;
}

export const PerformanceMonitor = memo<PerformanceMonitorProps>(({
  enabled = process.env.NODE_ENV === 'development',
  position = 'bottom-right',
  showDetails = true
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadTime] = useState(() => {
    if (typeof window !== 'undefined' && window.performance) {
      return Math.round(performance.now());
    }
    return 0;
  });

  const fps = useFPS();
  const memoryUsage = useMemoryUsage();
  const renderCount = useRenderCount();
  const networkStatus = useNetworkStatus();
  const [domNodes, setDomNodes] = useState(0);

  // DOM 노드 수 계산
  useEffect(() => {
    const updateDomNodes = () => {
      if (typeof document !== 'undefined') {
        setDomNodes(document.querySelectorAll('*').length);
      }
    };

    updateDomNodes();
    const interval = setInterval(updateDomNodes, 5000);

    return () => clearInterval(interval);
  }, []);

  if (!enabled) return null;

  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };

  const metrics: PerformanceMetrics = {
    fps,
    memoryUsage,
    renderCount,
    loadTime,
    domNodes,
    onlineStatus: networkStatus.isOnline,
    connectionType: networkStatus.connectionType
  };

  const getStatusColor = (metric: keyof PerformanceMetrics, value: any) => {
    switch (metric) {
      case 'fps':
        return value >= 55 ? 'text-green-600' : value >= 30 ? 'text-yellow-600' : 'text-red-600';
      case 'memoryUsage':
        return value <= 50 ? 'text-green-600' : value <= 100 ? 'text-yellow-600' : 'text-red-600';
      case 'domNodes':
        return value <= 1000 ? 'text-green-600' : value <= 2000 ? 'text-yellow-600' : 'text-red-600';
      case 'onlineStatus':
        return value ? 'text-green-600' : 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={`fixed ${positionClasses[position]} z-50 font-mono text-xs`}>
      <div className="bg-black/80 text-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 bg-gray-900 hover:bg-gray-800 transition-colors duration-200 flex items-center justify-between"
        >
          <span className="font-semibold">Performance</span>
          <span className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {/* Compact view */}
        {!isExpanded && (
          <div className="px-3 py-2 space-y-1">
            <div className={`${getStatusColor('fps', fps)}`}>
              FPS: {fps}
            </div>
            <div className={`${getStatusColor('memoryUsage', memoryUsage)}`}>
              Memory: {memoryUsage}MB
            </div>
          </div>
        )}

        {/* Expanded view */}
        {isExpanded && showDetails && (
          <div className="px-3 py-2 space-y-2 max-w-xs">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-400">FPS:</span>
                <span className={`ml-1 ${getStatusColor('fps', metrics.fps)}`}>
                  {metrics.fps}
                </span>
              </div>
              
              <div>
                <span className="text-gray-400">Memory:</span>
                <span className={`ml-1 ${getStatusColor('memoryUsage', metrics.memoryUsage)}`}>
                  {metrics.memoryUsage}MB
                </span>
              </div>
              
              <div>
                <span className="text-gray-400">Renders:</span>
                <span className="ml-1 text-blue-400">{metrics.renderCount}</span>
              </div>
              
              <div>
                <span className="text-gray-400">Load:</span>
                <span className="ml-1 text-blue-400">{metrics.loadTime}ms</span>
              </div>
              
              <div>
                <span className="text-gray-400">DOM:</span>
                <span className={`ml-1 ${getStatusColor('domNodes', metrics.domNodes)}`}>
                  {metrics.domNodes}
                </span>
              </div>
              
              <div>
                <span className="text-gray-400">Network:</span>
                <span className={`ml-1 ${getStatusColor('onlineStatus', metrics.onlineStatus)}`}>
                  {metrics.onlineStatus ? '●' : '○'}
                </span>
              </div>
            </div>
            
            {metrics.connectionType && metrics.connectionType !== 'unknown' && (
              <div className="text-gray-400 text-xs">
                Connection: {metrics.connectionType}
              </div>
            )}
            
            {/* Performance warnings */}
            <div className="space-y-1 text-xs">
              {metrics.fps < 30 && (
                <div className="text-red-400">⚠️ Low FPS detected</div>
              )}
              {metrics.memoryUsage > 100 && (
                <div className="text-red-400">⚠️ High memory usage</div>
              )}
              {metrics.domNodes > 2000 && (
                <div className="text-yellow-400">⚠️ Many DOM nodes</div>
              )}
              {!metrics.onlineStatus && (
                <div className="text-red-400">⚠️ Offline</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

PerformanceMonitor.displayName = 'PerformanceMonitor'; 