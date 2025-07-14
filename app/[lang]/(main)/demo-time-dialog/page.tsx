'use client';

import React, { useState } from 'react';
import { QueryTimeDialog } from '@/components/ui/Dialog';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function DemoTimeDialogPage() {
  const searchParams = useSearchParams();
  const [showDialog, setShowDialog] = useState(false);

  // 현재 시간을 기준으로 예시 시간 생성
  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
  const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  const examples = [
    {
      title: '현재 활성화 (종료 시간만 설정)',
      url: `?stop_at=${twoHoursLater.toISOString()}`,
      description: '지금부터 2시간 후까지 활성화'
    },
    {
      title: '1시간 후 시작',
      url: `?start_at=${oneHourLater.toISOString()}&stop_at=${twoHoursLater.toISOString()}`,
      description: '1시간 후부터 2시간 후까지 활성화'
    },
    {
      title: '이미 종료됨',
      url: `?start_at=${oneHourAgo.toISOString()}&stop_at=${now.toISOString()}`,
      description: '1시간 전부터 지금까지 (이미 종료)'
    },
    {
      title: '디버그 모드 (항상 표시)',
      url: `?debug=true`,
      description: '시간 제한 무시하고 항상 표시'
    },
    {
      title: '시간 정보 표시',
      url: `?stop_at=${twoHoursLater.toISOString()}&show_time=true`,
      description: '남은 시간 정보와 함께 표시'
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">시간 기반 다이얼로그 데모</h1>
        <p className="text-gray-600 mb-6">
          URL 쿼리 파라미터를 통해 start_at, stop_at 시간을 설정하여 
          서버 시간 기준으로 다이얼로그 노출을 제어할 수 있습니다.
        </p>
      </div>

      {/* 현재 상태 표시 */}
      <div className="bg-gray-50 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4">현재 상태</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">현재 시간:</span>
            <span className="ml-2">{now.toLocaleString()}</span>
          </div>
          <div>
            <span className="font-medium">쿼리 파라미터:</span>
            <span className="ml-2 font-mono text-xs">
              {searchParams.toString() || '(없음)'}
            </span>
          </div>
        </div>
      </div>

      {/* 예시 링크들 */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">예시 테스트</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {examples.map((example, index) => (
            <Link
              key={index}
              href={example.url}
              className="block p-4 border border-gray-200 rounded-lg hover:border-primary hover:shadow-sm transition-all"
            >
              <h3 className="font-medium text-primary mb-2">{example.title}</h3>
              <p className="text-sm text-gray-600 mb-2">{example.description}</p>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                {example.url}
              </code>
            </Link>
          ))}
        </div>
      </div>

      {/* 수동 테스트 버튼 */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">수동 테스트</h2>
        <button
          onClick={() => setShowDialog(true)}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors"
        >
          다이얼로그 열기 (현재 쿼리 조건 적용)
        </button>
      </div>

      {/* 사용법 안내 */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">사용법</h2>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="font-medium mb-2">쿼리 파라미터:</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li><code>start_at</code>: 노출 시작 시간 (ISO 8601 형식)</li>
              <li><code>stop_at</code>: 노출 종료 시간 (ISO 8601 형식)</li>
              <li><code>debug</code>: 디버그 모드 (true/1로 설정 시 항상 표시)</li>
            </ul>
          </div>
          <div>
            <h3 className="font-medium mb-2">예시 URL:</h3>
            <div className="bg-white p-3 rounded border font-mono text-xs">
              /demo-time-dialog?start_at=2024-01-01T00:00:00Z&stop_at=2024-12-31T23:59:59Z
            </div>
          </div>
        </div>
      </div>

      {/* 시간 기반 다이얼로그 */}
      <QueryTimeDialog
        defaultOpen={showDialog}
        onClose={() => setShowDialog(false)}
        title="시간 기반 다이얼로그"
        showTimeInfo={searchParams.get('show_time') === 'true'}
        size="md"
        onTimeCheck={(shouldDisplay, status) => {
          console.log('시간 체크 결과:', { shouldDisplay, status });
        }}
      >
        <div className="py-4">
          <h3 className="text-lg font-semibold mb-3">
            🎉 성공적으로 표시되었습니다!
          </h3>
          <p className="text-gray-600 mb-4">
            현재 시간이 설정된 조건을 만족하여 다이얼로그가 표시되고 있습니다.
          </p>
          <div className="bg-green-50 p-3 rounded text-sm">
            <strong>현재 쿼리:</strong>
            <br />
            <code className="text-green-700">
              {searchParams.toString() || '(쿼리 없음 - 항상 표시)'}
            </code>
          </div>
        </div>
      </QueryTimeDialog>
    </div>
  );
} 