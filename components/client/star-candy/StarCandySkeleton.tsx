'use client';

import React from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export function StarCandySkeleton() {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2 animate-pulse bg-gray-200 text-transparent">별사탕 충전</h1>
        <p className="text-gray-600 animate-pulse bg-gray-200 text-transparent">상품 정보를 불러오는 중...</p>
      </div>
      <div className="flex justify-center items-center min-h-[200px]">
        <LoadingSpinner />
        <span className="ml-3 text-gray-600">상품 정보를 불러오는 중...</span>
      </div>
    </div>
  );
} 