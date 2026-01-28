import { useState, useEffect, useRef, useCallback } from 'react';

export interface ContainerSize {
  width: number;
  height: number;
}

/**
 * Hook to measure a container's dimensions using ResizeObserver.
 * Returns a ref to attach to the container and the current size.
 * Uses requestAnimationFrame to batch updates and prevent excessive re-renders.
 */
export function useContainerSize<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  const updateSize = useCallback(() => {
    // Cancel any pending update
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    // Schedule update on next frame
    rafRef.current = requestAnimationFrame(() => {
      if (ref.current) {
        const { width, height } = ref.current.getBoundingClientRect();
        setSize((prev) => {
          // Only update if dimensions actually changed
          if (Math.abs(prev.width - width) > 1 || Math.abs(prev.height - height) > 1) {
            return { width, height };
          }
          return prev;
        });
      }
    });
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Initial measurement
    updateSize();

    // Observe resize
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [updateSize]);

  return { ref, size };
}
