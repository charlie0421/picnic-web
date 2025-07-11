'use client';

import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  memo, 
  useMemo 
} from 'react';
import Image from 'next/image';

interface VirtualScrollListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  loadingComponent?: React.ReactNode;
  isLoading?: boolean;
  onEndReached?: () => void;
  endReachedThreshold?: number;
}

export const VirtualScrollList = memo(<T,>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
  onScroll,
  loadingComponent,
  isLoading = false,
  onEndReached,
  endReachedThreshold = 0.8
}: VirtualScrollListProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  // Get visible items
  const visibleItems = useMemo(() => {
    const { startIndex, endIndex } = visibleRange;
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      index: startIndex + index,
      top: (startIndex + index) * itemHeight
    }));
  }, [items, visibleRange, itemHeight]);

  // Total height calculation
  const totalHeight = items.length * itemHeight;

  // Scroll handler with throttling
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = event.currentTarget.scrollTop;
    setScrollTop(newScrollTop);
    onScroll?.(newScrollTop);

    // Check if reached end
    if (onEndReached) {
      const { scrollHeight, clientHeight } = event.currentTarget;
      const scrollPercentage = (newScrollTop + clientHeight) / scrollHeight;
      
      if (scrollPercentage >= endReachedThreshold) {
        onEndReached();
      }
    }

    // Set scrolling state
    isScrollingRef.current = true;
    
    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    // Set timeout to detect scroll end
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
    }, 150);
  }, [onScroll, onEndReached, endReachedThreshold]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Scroll to specific index
  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    if (containerRef.current) {
      const scrollTop = index * itemHeight;
      containerRef.current.scrollTo({
        top: scrollTop,
        behavior
      });
    }
  }, [itemHeight]);

  // Scroll to top
  const scrollToTop = useCallback((behavior: ScrollBehavior = 'smooth') => {
    scrollToIndex(0, behavior);
  }, [scrollToIndex]);

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="overflow-auto"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {/* Virtual container with total height */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Visible items */}
          {visibleItems.map(({ item, index, top }) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                top,
                height: itemHeight,
                width: '100%',
                transform: `translateY(0)`, // Force GPU acceleration
                willChange: 'transform' // Optimize for animations
              }}
            >
              {renderItem(item, index)}
            </div>
          ))}
          
          {/* Loading indicator at the bottom */}
          {isLoading && (
            <div
              style={{
                position: 'absolute',
                top: totalHeight,
                width: '100%',
                height: 60
              }}
            >
              {loadingComponent || (
                <div className="flex justify-center items-center h-full">
                  <Image
                    src="/images/logo.png"
                    alt="Loading"
                    width={24}
                    height={24}
                    className="w-6 h-6 rounded-full animate-pulse drop-shadow-lg object-cover"
                    priority
                  />
                  <span className="ml-2 text-gray-600 text-sm animate-pulse">Loading...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Scroll to top button */}
      {scrollTop > containerHeight && (
        <button
          onClick={() => scrollToTop()}
          className="fixed bottom-4 right-4 w-12 h-12 bg-primary-600 text-white rounded-full shadow-lg hover:bg-primary-700 transition-colors duration-200 flex items-center justify-center z-10"
          aria-label="Scroll to top"
        >
          ↑
        </button>
      )}
    </div>
  );
});

VirtualScrollList.displayName = 'VirtualScrollList';

// Hook for Virtual Scrolling
export function useVirtualScroll<T>(
  items: T[],
  itemHeight: number,
  containerHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    const { startIndex, endIndex } = visibleRange;
    return items.slice(startIndex, endIndex + 1).map((item, index) => ({
      item,
      index: startIndex + index,
      top: (startIndex + index) * itemHeight
    }));
  }, [items, visibleRange, itemHeight]);

  return {
    visibleItems,
    totalHeight: items.length * itemHeight,
    setScrollTop,
    scrollTop
  };
} 