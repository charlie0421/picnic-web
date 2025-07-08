'use client';

import React from 'react';

export function StarCandySkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton - 실제 UI와 일치 */}
      <div className="text-center mb-8">
        <div className="h-8 bg-gray-200 rounded w-32 mx-auto mb-2 animate-pulse"></div>
        <div className="h-5 bg-gray-200 rounded w-80 mx-auto animate-pulse"></div>
      </div>

      {/* PaymentMethodSelector Skeleton - 실제 UI와 일치 */}
      <div className="space-y-4 mb-8">
        <div className="text-center">
          <div className="h-6 bg-gray-200 rounded w-24 mx-auto mb-2 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-40 mx-auto animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
          {/* Port One Skeleton - 선택된 상태 */}
          <div className="relative p-4 rounded-lg border-2 border-gray-300 bg-gray-50">
            <div className="absolute -top-2 -right-2 bg-gray-200 w-12 h-6 rounded-full animate-pulse"></div>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-200 rounded animate-pulse"></div>
              <div className="text-left flex-1">
                <div className="h-4 bg-gray-200 rounded w-16 mb-1 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-32 animate-pulse"></div>
              </div>
            </div>
          </div>
          {/* PayPal Skeleton */}
          <div className="p-4 rounded-lg border-2 border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
              <div className="text-left flex-1">
                <div className="h-4 bg-gray-200 rounded w-12 mb-1 animate-pulse"></div>
                <div className="h-3 bg-gray-200 rounded w-28 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

              {/* Products Grid Skeleton - 실제 UI와 정확히 일치 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
          {Array.from({ length: 10 }).map((_, index) => {
            // 600개(index 2), 1000개(index 3) 상품만 추천으로 표시
            const isFeatured = index === 2 || index === 3;
            return (
              <div
                key={index}
                className={`relative bg-white rounded-xl shadow-lg overflow-hidden ${
                  isFeatured ? 'ring-2 ring-gray-300' : ''
                }`}
              >
                {/* Featured Badge */}
                {isFeatured && (
                  <div className="absolute top-0 right-0 bg-gray-200 px-2 py-1 text-xs rounded-bl-lg animate-pulse"></div>
                )}

                <div className="p-6">
                  {/* 별사탕 아이콘 영역 */}
                  <div className="text-center mb-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 mb-3">
                      {/* 수량에 따른 아이콘 배치 */}
                      {index === 0 && (
                        <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
                      )}
                      {index === 1 && (
                        <div className="flex space-x-1">
                          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
                        </div>
                      )}
                      {(index === 2 || index === 3) && (
                        <div className="grid grid-cols-2 gap-1">
                          {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="w-6 h-6 bg-gray-200 rounded-full animate-pulse"></div>
                          ))}
                        </div>
                      )}
                      {index >= 4 && index <= 6 && (
                        <div className="grid grid-cols-3 gap-1">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="w-4 h-4 bg-gray-200 rounded-full animate-pulse"></div>
                          ))}
                        </div>
                      )}
                      {index >= 7 && (
                        <div className="relative">
                          <div className="w-16 h-16 bg-gray-200 rounded-full animate-pulse"></div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-6 h-6 bg-gray-300 rounded-full animate-pulse"></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 수량 텍스트 - text-xl font-bold */}
                    <div className="h-7 bg-gray-200 rounded w-20 mx-auto mb-1 animate-pulse"></div>
                    
                    {/* 보너스 텍스트 - text-sm */}
                    <div className="h-5 bg-gray-200 rounded w-24 mx-auto animate-pulse"></div>
                  </div>

                  {/* 패키지 설명 - 최소 높이 설정으로 카드 높이 통일 */}
                  <div className="text-center mb-4 min-h-[2rem] flex items-center justify-center">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto animate-pulse"></div>
                  </div>

                  {/* 가격 - text-2xl font-bold */}
                  <div className="text-center mb-4">
                    <div className="h-8 bg-gray-200 rounded w-24 mx-auto animate-pulse"></div>
                  </div>

                  {/* 버튼 - py-3 */}
                  <div className="h-12 bg-gray-200 rounded-lg w-full animate-pulse"></div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Notice Section Skeleton */}
      <div className="mt-8 bg-gray-50 rounded-lg p-6">
        <div className="h-5 bg-gray-200 rounded w-32 mb-2 animate-pulse"></div>
        <div className="space-y-1">
          <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
          <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
} 