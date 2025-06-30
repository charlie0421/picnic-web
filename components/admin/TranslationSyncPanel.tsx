'use client';

import React, { useState } from 'react';

interface SyncResult {
  message: string;
  results: Record<
    string,
    {
      success: boolean;
      keysCount?: number;
      updatedAt?: string;
      error?: string;
    }
  >;
  syncedAt: string;
}

type LangResult = {
  success: boolean;
  keysCount?: number;
  updatedAt?: string;
  error?: string;
};

export function TranslationSyncPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiKey = prompt('관리자 API 키를 입력하세요:');
      if (!apiKey) {
        setError('API 키가 필요합니다.');
        return;
      }

      const response = await fetch('/api/translations/sync', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Sync failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className='p-6 bg-white rounded-lg shadow-md'>
      <h2 className='text-xl font-bold mb-4'>번역 동기화 관리</h2>

      <div className='mb-4'>
        <p className='text-gray-600 mb-2'>
          로컬 번역 파일을 동기화하고 관리합니다.
        </p>
        <button
          onClick={handleSync}
          disabled={isLoading}
          className={`px-4 py-2 rounded font-medium ${
            isLoading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isLoading ? '동기화 중...' : '번역 동기화 실행'}
        </button>
      </div>

      {error && (
        <div className='mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded'>
          <strong>에러:</strong> {error}
        </div>
      )}

      {result && (
        <div className='space-y-4'>
          <div className='p-3 bg-green-100 border border-green-400 text-green-700 rounded'>
            <strong>동기화 완료:</strong> {result.syncedAt}
          </div>

          <div className='space-y-2'>
            <h3 className='font-semibold'>언어별 결과:</h3>
            {Object.entries(result.results).map(([lang, langResult]) => {
              const typedResult = langResult as LangResult;
              return (
                <div
                  key={lang}
                  className={`p-2 rounded border ${
                    typedResult.success
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  <div className='font-medium'>{lang.toUpperCase()}</div>
                  {typedResult.success ? (
                    <div className='text-sm text-green-600'>
                      ✅ {typedResult.keysCount}개 키 업데이트됨
                      {typedResult.updatedAt && (
                        <div className='text-xs'>
                          업데이트:{' '}
                          {new Date(typedResult.updatedAt).toLocaleString(
                            'ko-KR',
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className='text-sm text-red-600'>
                      ❌ {typedResult.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
