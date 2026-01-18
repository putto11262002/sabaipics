import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadPhoto } from '../../../../../hooks/photos/useUploadPhoto';
import type { UploadQueueItem } from './upload';
import type { Photo } from '../../../../../hooks/photos/usePhotos';

export type { UploadQueueItem };

const MAX_TOKENS = 5;

export function useUploadQueue(eventId: string | undefined) {
  const queryClient = useQueryClient();
  const uploadPhotoMutation = useUploadPhoto();

  // Refs for queue management (non-reactive)
  const pendingQueueRef = useRef<UploadQueueItem[]>([]);
  const activeUploadsRef = useRef<Map<string, UploadQueueItem>>(new Map());
  const failedUploadsRef = useRef<Map<string, UploadQueueItem>>(new Map());
  const tokensRef = useRef(MAX_TOKENS);

  // Minimal reactive state for UI
  const [displayItems, setDisplayItems] = useState<UploadQueueItem[]>([]);

  // Helper to add optimistic photo to cache
  const addOptimisticPhotoToCache = useCallback((tempId: string) => {
    if (!eventId) return;

    const optimisticPhoto = {
      id: tempId,
      thumbnailUrl: '',
      previewUrl: '',
      faceCount: 0,
      fileSize: null as number | null,
      status: 'uploading' as const,
      uploadedAt: new Date().toISOString(),
    };

    // Add to all relevant query caches (with and without status filter)
    const queryKeys = [
      ['event', eventId, 'photos'],
      ['event', eventId, 'photos', ['uploading', 'indexing', 'failed']],
      ['event', eventId, 'photos', ['uploading']],
      ['event', eventId, 'photos', ['indexing']],
      ['event', eventId, 'photos', ['failed']],
    ];

    queryKeys.forEach((key) => {
      queryClient.setQueryData(
        key,
        (old: any) => {
          if (!old) return old;

          // Handle infinite query structure
          if (old.pages) {
            return {
              ...old,
              pages: old.pages.map((page: any, index: number) =>
                index === 0
                  ? {
                      ...page,
                      data: [optimisticPhoto, ...page.data],
                    }
                  : page
              ),
            };
          }

          return old;
        },
        { updatedAt: Date.now() }
      );
    });
  }, [eventId, queryClient]);

  // Helper to update optimistic photo in cache
  const updateOptimisticPhotoInCache = useCallback((tempId: string, updates: Partial<Photo>) => {
    if (!eventId) return;

    const queryKeys = [
      ['event', eventId, 'photos'],
      ['event', eventId, 'photos', ['uploading', 'indexing', 'failed']],
      ['event', eventId, 'photos', ['uploading']],
      ['event', eventId, 'photos', ['indexing']],
      ['event', eventId, 'photos', ['failed']],
    ];

    queryKeys.forEach((key) => {
      queryClient.setQueryData(
        key,
        (old: any) => {
          if (!old) return old;

          // Handle infinite query structure
          if (old.pages) {
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                data: page.data.map((photo: Photo) =>
                  photo.id === tempId ? { ...photo, ...updates } : photo
                ),
              })),
            };
          }

          return old;
        }
      );
    });
  }, [eventId, queryClient]);

  // Sync refs to display state
  const syncDisplayState = useCallback(() => {
    const items: UploadQueueItem[] = [
      ...pendingQueueRef.current,
      ...Array.from(activeUploadsRef.current.values()),
      ...Array.from(failedUploadsRef.current.values()),
    ];
    setDisplayItems(items);
  }, []);

  // Upload a single file
  const uploadFile = useCallback(
    async (item: UploadQueueItem, processNext: () => void) => {
      if (!eventId) return;

      try {
        const result = await uploadPhotoMutation.mutateAsync({
          eventId,
          file: item.file,
        });

        // Success - remove from active, update cache with real photo data
        activeUploadsRef.current.delete(item.id);

        // Update cache: replace temp ID with real photo data from server
        updateOptimisticPhotoInCache(item.id, {
          id: result.id,
          status: result.status,
          faceCount: result.faceCount,
        });

        // Remove the temp ID entry and invalidate to fetch fresh data
        queryClient.invalidateQueries({
          queryKey: ['event', eventId, 'photos'],
        });
      } catch (error) {
        const err = error as Error & { status?: number };
        let errorMessage = err.message || 'Upload failed';

        if (err.status === 402) {
          errorMessage = 'Insufficient credits';
        } else if (err.status === 410) {
          errorMessage = 'Event expired';
        }

        // Update optimistic photo with error (set status to 'failed')
        updateOptimisticPhotoInCache(item.id, {
          status: 'failed',
        });

        // Move to failed (keep for retry functionality)
        activeUploadsRef.current.delete(item.id);
        item.status = 'failed';
        item.error = errorMessage;
        item.errorStatus = err.status;
        failedUploadsRef.current.set(item.id, item);
      } finally {
        // Return token and process next
        tokensRef.current++;
        processNext();
      }
    },
    [eventId, uploadPhotoMutation, queryClient, updateOptimisticPhotoInCache],
  );

  // Process queue - takes tokens and starts uploads
  const processQueue = useCallback(() => {
    if (!eventId) return;

    while (tokensRef.current > 0 && pendingQueueRef.current.length > 0) {
      const item = pendingQueueRef.current.shift()!;
      tokensRef.current--;

      // Move to active
      item.status = 'uploading';
      activeUploadsRef.current.set(item.id, item);

      // Start upload (fire and forget, handled by promises)
      uploadFile(item, processQueue);
    }

    syncDisplayState();
  }, [eventId, syncDisplayState, uploadFile]);

  // Add files to queue
  const addFiles = useCallback(
    (files: File[]) => {
      const now = Date.now();
      const newItems: UploadQueueItem[] = files.map((file) => ({
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'queued' as const,
      }));

      // Add optimistic photos to React Query cache
      newItems.forEach((item) => {
        addOptimisticPhotoToCache(item.id);
      });

      pendingQueueRef.current.push(...newItems);
      processQueue();
    },
    [processQueue, addOptimisticPhotoToCache],
  );

  // Retry a failed upload
  const retryUpload = useCallback(
    (itemId: string) => {
      const item = failedUploadsRef.current.get(itemId);
      if (!item) return;

      // Reset and move back to pending
      failedUploadsRef.current.delete(itemId);
      item.status = 'queued';
      item.error = undefined;
      item.errorStatus = undefined;
      pendingQueueRef.current.push(item);
      processQueue();
    },
    [processQueue],
  );

  // Remove a failed upload
  const removeFromQueue = useCallback(
    (itemId: string) => {
      failedUploadsRef.current.delete(itemId);
      syncDisplayState();
    },
    [syncDisplayState],
  );

  // Computed values for UI
  const uploadingCount = displayItems.filter(
    (i) => i.status === 'queued' || i.status === 'uploading',
  ).length;

  const failedCount = displayItems.filter((i) => i.status === 'failed').length;

  const uploadingItems = displayItems.filter(
    (i) => i.status === 'queued' || i.status === 'uploading',
  );

  const failedItems = displayItems.filter((i) => i.status === 'failed');

  return {
    // Actions
    addFiles,
    retryUpload,
    removeFromQueue,

    // State for UI
    uploadingItems,
    failedItems,
    uploadingCount,
    failedCount,
    isUploading: uploadingCount > 0,
  };
}
