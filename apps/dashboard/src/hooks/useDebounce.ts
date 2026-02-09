import { useEffect, useState } from 'react';

/**
 * Debounce a value - delays updating the value until after a specified delay
 * Useful for avoiding excessive API calls on rapid input changes
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
