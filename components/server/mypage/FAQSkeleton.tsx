import React from 'react';

export default function FaqSkeleton() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex flex-wrap gap-4">
          <div className="h-10 w-20 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 rounded-full animate-pulse"></div>
          <div className="h-10 w-20 bg-gray-200 rounded-full animate-pulse"></div>
        </div>
      </div>
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="border-b py-4">
            <div className="h-6 bg-gray-200 rounded w-3/4 animate-pulse"></div>
          </div>
        ))}
      </div>
    </div>
  );
};
