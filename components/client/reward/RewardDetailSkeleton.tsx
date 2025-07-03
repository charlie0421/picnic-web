'use client';

import React from 'react';

export function RewardDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Image Gallery Skeleton */}
          <div className="space-y-4">
            {/* Main Image */}
            <div className="aspect-square bg-gray-200 rounded-lg animate-pulse"></div>
            
            {/* Thumbnail Images */}
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="aspect-square bg-gray-200 rounded-md animate-pulse"
                ></div>
              ))}
            </div>
          </div>

          {/* Right: Product Details Skeleton */}
          <div className="space-y-6">
            {/* Breadcrumb */}
            <div className="flex items-center space-x-2">
              <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-1 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
            </div>

            {/* Title */}
            <div className="h-8 bg-gray-200 rounded w-3/4 animate-pulse"></div>

            {/* Category/Type Badge */}
            <div className="h-6 bg-gray-200 rounded-full w-20 animate-pulse"></div>

            {/* Price/Value */}
            <div className="space-y-2">
              <div className="h-6 bg-gray-200 rounded w-32 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
            </div>

            {/* Description */}
            <div className="space-y-3">
              <div className="h-5 bg-gray-200 rounded w-20 animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
              </div>
            </div>

            {/* Specifications/Details */}
            <div className="space-y-4">
              <div className="h-5 bg-gray-200 rounded w-24 animate-pulse"></div>
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="flex justify-between">
                    <div className="h-4 bg-gray-200 rounded w-20 animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded w-32 animate-pulse"></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stock/Availability */}
            <div className="flex items-center space-x-4">
              <div className="h-4 bg-gray-200 rounded w-16 animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"></div>
            </div>

            {/* Quantity Selector */}
            <div className="flex items-center space-x-4">
              <div className="h-4 bg-gray-200 rounded w-12 animate-pulse"></div>
              <div className="flex items-center space-x-2">
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-10 w-16 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-10 w-10 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <div className="h-12 bg-gray-200 rounded-lg w-full animate-pulse"></div>
              <div className="h-10 bg-gray-200 rounded-lg w-full animate-pulse"></div>
            </div>

            {/* Additional Info */}
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="h-5 bg-gray-200 rounded w-32 mb-3 animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                <div className="h-4 bg-gray-200 rounded w-4/5 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

        {/* Related/Recommended Products */}
        <div className="mt-16">
          <div className="h-7 bg-gray-200 rounded w-48 mb-6 animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse"
              >
                <div className="aspect-square bg-gray-200"></div>
                <div className="p-4">
                  <div className="h-5 bg-gray-200 rounded mb-2 w-3/4"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
} 