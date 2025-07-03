'use client';

import React from 'react';

export function MediaSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="bg-white shadow-md rounded-lg overflow-hidden animate-pulse"
        >
          {/* Video Thumbnail - aspect-video로 16:9 비율 */}
          <div className="relative w-full aspect-video bg-gray-200">
            {/* Play Button Overlay */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 bg-gray-300 rounded-full"></div>
            </div>
          </div>
          
          {/* Content - 실제 UI와 동일한 padding */}
          <div className="p-4 bg-white/90">
            {/* Title - 2줄 제목 */}
            <div className="h-5 bg-gray-200 rounded mb-2 w-full"></div>
            <div className="h-5 bg-gray-200 rounded mb-2 w-3/4"></div>
            
            {/* Date */}
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
  );
} 