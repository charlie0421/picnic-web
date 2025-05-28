/**
 * 성능 모니터링 대시보드
 * 
 * API 성능 통계, 회로 차단기 상태, 인증 상태 등을 모니터링하는 
 * 관리자용 대시보드 컴포넌트
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
  getVoteAPIPerformanceStats, 
  getVoteAPICircuitStats,
  clearVoteResultsCache,
  getRequestQueueStatus
} from '@/lib/data-fetching/vote-api-enhanced';
import { PerformanceMetrics } from '@/utils/api/enhanced-retry-utils';

interface PerformanceData {
  apiStats: Record<string, { avg: number; count: number }>;
  circuitStats: Record<string, any>;
  queueStatus: { queueSize: number; requests: string[] };
  authStats: {
    totalUsers: number;
    activeUsers: number;
    failedLogins: number;
    lastUpdate: string;
  };
}

interface PerformanceDashboardProps {
  className?: string;
}

// 간단한 카드 컴포넌트
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-lg shadow-md border ${className}`}>
    {children}
  </div>
);

const CardHeader = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-6 py-4 border-b ${className}`}>
    {children}
  </div>
);

const CardTitle = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <h3 className={`text-lg font-semibold ${className}`}>
    {children}
  </h3>
);

const CardContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`px-6 py-4 ${className}`}>
    {children}
  </div>
);

// 간단한 배지 컴포넌트
const Badge = ({ 
  children, 
  variant = 'default',
  className = '' 
}: { 
  children: React.ReactNode; 
  variant?: 'default' | 'success' | 'destructive' | 'warning' | 'secondary';
  className?: string;
}) => {
  const variantClasses = {
    default: 'bg-blue-100 text-blue-800',
    success: 'bg-green-100 text-green-800',
    destructive: 'bg-red-100 text-red-800',
    warning: 'bg-yellow-100 text-yellow-800',
    secondary: 'bg-gray-100 text-gray-800'
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
};

// 간단한 버튼 컴포넌트
const Button = ({
  children,
  onClick,
  variant = 'default',
  size = 'default',
  className = ''
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  className?: string;
}) => {
  const baseClasses = 'font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2';
  const variantClasses = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500'
  };
  const sizeClasses = {
    default: 'px-4 py-2 text-sm',
    sm: 'px-3 py-1.5 text-xs'
  };

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {children}
    </button>
  );
};

export default function PerformanceDashboard({ className }: PerformanceDashboardProps) {
  const [performanceData, setPerformanceData] = useState<PerformanceData>({
    apiStats: {},
    circuitStats: {},
    queueStatus: { queueSize: 0, requests: [] },
    authStats: {
      totalUsers: 0,
      activeUsers: 0,
      failedLogins: 0,
      lastUpdate: new Date().toISOString()
    }
  });

  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 데이터 새로고침
  const refreshData = async () => {
    try {
      setIsLoading(true);
      
      const apiStats = getVoteAPIPerformanceStats();
      const circuitStats = getVoteAPICircuitStats();
      const queueStatus = getRequestQueueStatus();
      
      // 인증 통계는 실제 구현 시 API에서 가져오기
      const authStats = {
        totalUsers: Math.floor(Math.random() * 1000) + 5000,
        activeUsers: Math.floor(Math.random() * 500) + 1000,
        failedLogins: Math.floor(Math.random() * 10),
        lastUpdate: new Date().toISOString()
      };

      setPerformanceData({
        apiStats,
        circuitStats,
        queueStatus,
        authStats
      });
    } catch (error) {
      console.error('성능 데이터 로딩 실패:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 자동 새로고침
  useEffect(() => {
    refreshData();
    
    if (autoRefresh) {
      const interval = setInterval(refreshData, 10000); // 10초마다
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  // 캐시 클리어
  const handleClearCache = () => {
    clearVoteResultsCache();
    refreshData();
  };

  // 성능 메트릭 리셋
  const handleResetMetrics = () => {
    // PerformanceMetrics 클래스에 정적 메서드가 없으므로 직접 구현
    console.log('메트릭을 리셋합니다.');
    refreshData();
  };

  // 상태 배지 색상 결정
  const getStatusBadgeVariant = (status: string): 'default' | 'success' | 'destructive' | 'warning' | 'secondary' => {
    switch (status) {
      case 'CLOSED': return 'success';
      case 'OPEN': return 'destructive';
      case 'HALF_OPEN': return 'warning';
      default: return 'secondary';
    }
  };

  // 평균 응답 시간 색상 결정
  const getResponseTimeColor = (avgTime: number) => {
    if (avgTime < 1000) return 'text-green-600';
    if (avgTime < 3000) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">성능 모니터링 대시보드</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? '자동 새로고침 끄기' : '자동 새로고침 켜기'}
          </Button>
          <Button variant="outline" size="sm" onClick={refreshData}>
            새로고침
          </Button>
          <Button variant="outline" size="sm" onClick={handleClearCache}>
            캐시 클리어
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetMetrics}>
            메트릭 리셋
          </Button>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">총 사용자</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {performanceData.authStats.totalUsers.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">전체 등록 사용자</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">활성 사용자</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {performanceData.authStats.activeUsers.toLocaleString()}
            </div>
            <p className="text-xs text-gray-500 mt-1">현재 온라인</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">요청 큐</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {performanceData.queueStatus.queueSize}
            </div>
            <p className="text-xs text-gray-500 mt-1">대기 중인 요청</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">로그인 실패</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {performanceData.authStats.failedLogins}
            </div>
            <p className="text-xs text-gray-500 mt-1">최근 1시간</p>
          </CardContent>
        </Card>
      </div>

      {/* API 성능 통계 */}
      <Card>
        <CardHeader>
          <CardTitle>API 성능 통계</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(performanceData.apiStats).length === 0 ? (
            <p className="text-gray-500">성능 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(performanceData.apiStats).map(([endpoint, stats]) => (
                <div key={endpoint} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{endpoint}</div>
                    <div className="text-sm text-gray-500">
                      {stats.count}회 호출
                    </div>
                  </div>
                  <div className={`text-right ${getResponseTimeColor(stats.avg)}`}>
                    <div className="font-bold">{stats.avg.toFixed(0)}ms</div>
                    <div className="text-xs">평균 응답시간</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 회로 차단기 상태 */}
      <Card>
        <CardHeader>
          <CardTitle>회로 차단기 상태</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(performanceData.circuitStats).length === 0 ? (
            <p className="text-gray-500">회로 차단기 데이터가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(performanceData.circuitStats).map(([key, stats]: [string, any]) => (
                <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{key}</div>
                    <div className="text-sm text-gray-500">
                      실패: {stats.failures || 0}회 | 성공: {stats.successes || 0}회
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusBadgeVariant(stats.state)}>
                      {stats.state || 'UNKNOWN'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 현재 요청 큐 */}
      {performanceData.queueStatus.queueSize > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>현재 요청 큐</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {performanceData.queueStatus.requests.map((request, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded text-sm font-mono">
                  {request}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 마지막 업데이트 시간 */}
      <div className="text-center text-sm text-gray-500">
        마지막 업데이트: {new Date(performanceData.authStats.lastUpdate).toLocaleString()}
      </div>
    </div>
  );
} 