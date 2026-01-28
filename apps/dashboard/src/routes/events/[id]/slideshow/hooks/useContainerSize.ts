import { useState, useEffect, useRef, useCallback } from 'react';

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Hook to measure a container's dimensions using ResizeObserver.
 * Returns a ref to attach to the container and the current size.
 */
export function useContainerSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });

  const updateSize = useCallback(() => {
    if (ref.current) {
      const { width, height } = ref.current.getBoundingClientRect();
      setSize((prev) => {
        if (prev.width !== width || prev.height !== height) {
          return { width, height };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement
    updateSize();

    // Observe resize
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, [updateSize]);

  return { ref, size };
}
