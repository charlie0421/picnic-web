import React from 'react';

export default function QnaSkeleton() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="relative bg-white/80 backdrop-blur-md rounded-2xl shadow-lg border border-white/30 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-secondary to-point"></div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-primary to-secondary rounded-xl animate-pulse"></div>
                <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
              </div>
              <div className="h-10 bg-gray-200 rounded-lg w-24 animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="bg-white rounded-xl shadow-md p-4 animate-pulse">
            <div className="flex justify-between items-center">
              <div className="h-5 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-16"></div>
            </div>
            <div className="mt-2 h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-8">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  );
}
