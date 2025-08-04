import React from 'react';

export default function NoticeDetailSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 animate-pulse">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="mb-6 h-6 bg-gray-200 rounded w-32"></div>
        <div className="border-b pb-4 mb-6">
          <div className="flex items-center space-x-2 mb-2">
            <div className="h-5 bg-gray-200 rounded w-20"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-2/3"></div>
        </div>
      </div>
    </div>
  );
}
