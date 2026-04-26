import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * 값(value)을 디바운싱하는 훅
 *
 * @example
 * const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
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

/**
 * 콜백 함수를 디바운싱하는 훅
 *
 * @example
 * const debouncedSave = useDebouncedCallback(handleSave, 1000);
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
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
 * @deprecated Rules of Hooks 위반 가능성이 있습니다.
 * 대신 useDebouncedValue() 또는 useDebouncedCallback()을 직접 사용하세요.
 *
 * 하위 호환성을 위해 유지합니다.
 * 내부적으로 값 타입은 useDebouncedValue, 함수 타입은 useDebouncedCallback으로 분기합니다.
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
): T;
export function useDebounce<T>(value: T, delay: number): T;
export function useDebounce<T>(value: T, delay: number): T {
  if (typeof value === 'function') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useDebouncedCallback(value as any, delay);
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useDebouncedValue(value, delay);
}
