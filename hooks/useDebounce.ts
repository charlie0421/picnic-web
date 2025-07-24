import { useState, useEffect, useRef, useCallback } from 'react';

// 값(value)을 디바운싱하는 훅
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// 콜백 함수를 디바운싱하는 훅
function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;
}

/**
 * 디바운싱을 위한 커스텀 훅입니다.
 * 값(value) 또는 콜백(callback)을 디바운싱할 수 있습니다.
 *
 * @param value - 디바운싱할 값 또는 콜백 함수.
 * @param delay - 디바운싱 지연 시간 (밀리초).
 * @returns 디바운싱된 값 또는 디바운싱된 콜백 함수.
 *
 * @example
 * // 값 디바운싱
 * const debouncedSearchTerm = useDebounce(searchTerm, 500);
 *
 * @example
 * // 콜백 함수 디바운싱
 * const debouncedSave = useDebounce(handleSave, 1000);
 */
export function useDebounce<T>(
  value: T,
  delay: number
): T extends (...args: any[]) => any ? T : T {
  if (typeof value === 'function') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useDebouncedCallback(value as any, delay) as any;
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDebouncedValue(value, delay);
} 