import { useRef, useState, useCallback } from 'react';
import { useUploadPhoto } from '../../../../../hooks/photos/useUploadPhoto';
import { generateThumbnailUrl, generatePreviewUrl } from '../../../../../lib/photos';
import type { UploadQueueItem } from './upload';

export type { UploadQueueItem };

const MAX_TOKENS = 5;

export function useUploadQueue(eventId: string | undefined) {
  const uploadPhotoMutation = useUploadPhoto();

  // Refs for queue management (non-reactive)
  const pendingQueueRef = useRef<UploadQueueItem[]>([]);
  const activeUploadsRef = useRef<Map<string, UploadQueueItem>>(new Map());
  const failedUploadsRef = useRef<Map<string, UploadQueueItem>>(new Map());
  const tokensRef = useRef(MAX_TOKENS);

  // Minimal reactive state for UI
  const [displayItems, setDisplayItems] = useState<UploadQueueItem[]>([]);

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

      // Update upload log to show uploading
      const actions = (window as any).__uploadLogActions;
      if (actions) {
        actions.updateEntry(item.id, { status: 'uploading' });
      }

      try {
        const result = await uploadPhotoMutation.mutateAsync({
          eventId,
          file: item.file,
        });

        // Success - remove from active, update upload log with real photo data
        activeUploadsRef.current.delete(item.id);

        if (actions) {
          actions.updateEntry(item.id, {
            id: result.id,
            status: result.status,
            faceCount: result.faceCount,
          });
        }

        // Optimistically add to gallery cache (indexed photos)
        const queryClient = (window as any).__queryClient;
        if (queryClient) {
          queryClient.setQueryData(
            ['event', eventId, 'photos', ['indexed']],
            (old: any) => {
              if (!old || !old.pages) return old;

              const optimisticPhoto = {
                id: result.id,
                thumbnailUrl: generateThumbnailUrl(result.r2Key),
                previewUrl: generatePreviewUrl(result.r2Key),
                status: 'indexed',
                faceCount: result.faceCount,
                fileSize: result.fileSize ?? null,
                uploadedAt: result.uploadedAt,
              };

              return {
                ...old,
                pages: old.pages.map((page: any, index: number) =>
                  index === 0
                    ? { ...page, data: [optimisticPhoto, ...page.data] }
                    : page
                ),
              };
            }
          );
        }
      } catch (error) {
        const err = error as Error & { status?: number };
        let errorMessage = err.message || 'Upload failed';

        if (err.status === 402) {
          errorMessage = 'Insufficient credits';
        } else if (err.status === 410) {
          errorMessage = 'Event expired';
        }

        // Update upload log with error
        if (actions) {
          actions.updateEntry(item.id, {
            status: 'failed',
            error: errorMessage,
          });
        }

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
    [eventId, uploadPhotoMutation],
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

      // Add to upload log (optimistic)
      const actions = (window as any).__uploadLogActions;
      newItems.forEach((item) => {
        if (actions) {
          actions.addEntry(item.id, item.file.name);
        }
      });

      pendingQueueRef.current.push(...newItems);
      processQueue();
    },
    [processQueue],
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
