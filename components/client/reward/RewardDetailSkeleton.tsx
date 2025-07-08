'use client';

import React from 'react';

export function RewardDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        
        {/* Tab Navigation Skeleton */}
        <div className="flex border-b border-gray-200 mb-6">
          <div className="px-4 py-2">
            <div className="h-5 bg-gray-200 rounded w-16 animate-pulse"></div>
          </div>
          <div className="px-4 py-2">
            <div className="h-5 bg-gray-200 rounded w-12 animate-pulse"></div>
          </div>
          <div className="px-4 py-2">
            <div className="h-5 bg-gray-200 rounded w-14 animate-pulse"></div>
          </div>
        </div>

        {/* Image Gallery Skeleton */}
        <div className="mb-8">
          {/* Main Image - aspect-video to match RewardImageGallery */}
          <div className="relative w-full aspect-video bg-gray-200 rounded-lg overflow-hidden mb-4 animate-pulse">
            {/* Navigation Buttons Skeleton */}
            <div className="absolute left-2 top-1/2 transform -translate-y-1/2">
              <div className="w-10 h-10 bg-gray-300 rounded-full animate-pulse"></div>
            </div>
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <div className="w-10 h-10 bg-gray-300 rounded-full animate-pulse"></div>
            </div>
            {/* Image Counter Skeleton */}
            <div className="absolute bottom-2 right-2">
              <div className="bg-gray-300 px-3 py-1 rounded-full">
                <div className="h-4 w-8 bg-gray-400 rounded animate-pulse"></div>
              </div>
            </div>
          </div>

          {/* Thumbnail Images Skeleton */}
          <div className="flex overflow-x-auto space-x-2 py-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="w-20 h-20 flex-shrink-0 bg-gray-200 rounded-md animate-pulse"
              ></div>
            ))}
          </div>
        </div>

        {/* Content Area Skeleton */}
        <div className="space-y-6">
          {/* Location Info Skeleton (conditional content) */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="h-6 bg-gray-200 rounded w-24 mb-4 animate-pulse"></div>
            <div className="space-y-3">
              <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
            </div>
          </div>

          {/* Size Guide Skeleton (conditional content) */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="h-6 bg-gray-200 rounded w-20 mb-4 animate-pulse"></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Content Skeleton */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 