import { useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadPhoto } from './useUploadPhoto';
import type { UploadQueueItem, UploadLogEntry } from '../../types/upload';

export type { UploadQueueItem, UploadLogEntry };

export interface FileValidationError {
  file: File;
  error: string;
}

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
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [uploadLog, setUploadLog] = useState<UploadLogEntry[]>([]);

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

      // Add to log immediately (prepend - newest first)
      setUploadLog((prev) => [
        {
          id: item.id,
          fileName: item.file.name,
          uploadStatus: 'uploading',
          startedAt: Date.now(),
        },
        ...prev,
      ]);

      try {
        const result = await uploadPhotoMutation.mutateAsync({
          eventId,
          file: item.file,
        });

        // Success - remove from active and update log entry
        activeUploadsRef.current.delete(item.id);

        // Update log entry with photoId
        setUploadLog((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, uploadStatus: 'uploaded' as const, photoId: result.id }
              : entry,
          ),
        );

        // Invalidate photos query to refresh gallery
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

        // Update log entry with error
        setUploadLog((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, uploadStatus: 'failed' as const, uploadError: errorMessage }
              : entry,
          ),
        );

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
    [eventId, uploadPhotoMutation, queryClient],
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
      const newItems: UploadQueueItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'queued' as const,
      }));

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

  // Clear validation errors
  const clearValidationErrors = useCallback(() => {
    setValidationErrors([]);
  }, []);

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
    setValidationErrors,
    clearValidationErrors,

    // State for UI
    uploadingItems,
    failedItems,
    uploadingCount,
    failedCount,
    validationErrors,
    uploadLog,
    isUploading: uploadingCount > 0,
  };
}
