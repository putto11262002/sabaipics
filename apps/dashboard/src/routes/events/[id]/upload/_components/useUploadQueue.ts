import { useRef, useState, useCallback, useEffect } from 'react';
import { useUploadPhoto } from '../../../../../hooks/photos/useUploadPhoto';
import { usePhotos, type Photo } from '../../../../../hooks/photos/usePhotos';
import { usePhotosStatus } from '../../../../../hooks/photos/usePhotoStatus';
import type { UploadQueueItem } from './upload';

export type { UploadQueueItem };

export interface UploadLogEntry {
  id: string;
  fileName?: string;
  status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  thumbnailUrl?: string;
  fileSize?: number | null | undefined;
  faceCount?: number | null | undefined;
  error?: string;
  uploadedAt: string;
}

const MAX_TOKENS = 5;

export function useUploadQueue(eventId: string | undefined) {
  const uploadPhotoMutation = useUploadPhoto();

  // Fetch existing photos from API (uploading/indexing/failed)
  const photosQuery = usePhotos({
    eventId,
    status: ['uploading', 'indexing', 'failed'],
  });

  // Upload log state (single source of truth)
  const uploadLogRef = useRef<Map<string, UploadLogEntry>>(new Map());
  const indexedForRemovalRef = useRef<Set<string>>(new Set()); // Track entries scheduled for removal
  const [, setUploadLogVersion] = useState(0); // Force re-renders

  // Initialize upload log with photos from API
  useEffect(() => {
    if (!photosQuery.data) return;

    const initialPhotos = photosQuery.data.pages.flatMap((page) => page.data);
    initialPhotos.forEach((photo: Photo) => {
      uploadLogRef.current.set(photo.id, {
        id: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
        fileSize: photo.fileSize,
        faceCount: photo.faceCount,
        status: photo.status,
        uploadedAt: photo.uploadedAt,
      });
    });

    setUploadLogVersion((v) => v + 1);
  }, [photosQuery.data]);

  // Status polling for upload log entries
  const pollableIds = Array.from(uploadLogRef.current.values())
    .filter((e) => {
      const isOptimistic = /^\d+-/.test(e.id);
      return !isOptimistic && e.status !== 'indexed' && e.status !== 'failed';
    })
    .map((e) => e.id);

  const { data: statuses } = usePhotosStatus(pollableIds, {
    refetchInterval: pollableIds.length > 0 ? 2000 : false,
  });

  // Update upload log from polling
  useEffect(() => {
    if (!statuses) return;

    statuses.forEach((status) => {
      const existing = uploadLogRef.current.get(status.id);
      if (!existing) return;

      // Skip updating entries already scheduled for removal
      if (indexedForRemovalRef.current.has(status.id)) return;

      uploadLogRef.current.set(status.id, {
        ...existing,
        ...status,
      });
    });

    setUploadLogVersion((v) => v + 1);
  }, [statuses]);

  // Remove indexed entries from upload log after 3 second delay
  useEffect(() => {
    if (!statuses) return;

    const indexedPhotos = statuses.filter((s) => s.status === 'indexed');
    if (indexedPhotos.length === 0) return;

    // Set timeouts for each indexed photo that isn't already scheduled
    indexedPhotos
      .filter((p) => !indexedForRemovalRef.current.has(p.id))
      .forEach((p) => {
        // Mark as scheduled for removal
        indexedForRemovalRef.current.add(p.id);

        setTimeout(() => {
          uploadLogRef.current.delete(p.id);
          indexedForRemovalRef.current.delete(p.id); // Clean up tracking
          setUploadLogVersion((v) => v + 1);
        }, 3000); // 3 second delay to show "Indexed" status
      });
    // Note: No cleanup function - let timeouts fire naturally
  }, [statuses]);

  // Helper to sync upload log state
  const syncUploadLog = useCallback(() => {
    setUploadLogVersion((v) => v + 1);
  }, []);

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
      uploadLogRef.current.set(item.id, {
        ...uploadLogRef.current.get(item.id)!,
        status: 'uploading',
      });
      syncUploadLog();

      try {
        const result = await uploadPhotoMutation.mutateAsync({
          eventId,
          file: item.file,
        });

        // Success - remove from active, update upload log with real photo data
        activeUploadsRef.current.delete(item.id);

        // Replace temp ID with real ID in upload log
        uploadLogRef.current.delete(item.id);
        uploadLogRef.current.set(result.id, {
          id: result.id,
          fileName: item.file.name,
          status: result.status,
          fileSize: result.fileSize,
          faceCount: result.faceCount,
          uploadedAt: result.uploadedAt,
        });
        syncUploadLog();

        // NOTE: No optimistic gallery updates - gallery refetches on mount
      } catch (error) {
        const err = error as Error & { status?: number };
        let errorMessage = err.message || 'Upload failed';

        if (err.status === 402) {
          errorMessage = 'Insufficient credits';
        } else if (err.status === 410) {
          errorMessage = 'Event expired';
        }

        // Update upload log with error
        uploadLogRef.current.set(item.id, {
          ...uploadLogRef.current.get(item.id)!,
          status: 'failed',
          error: errorMessage,
        });
        syncUploadLog();

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
    [eventId, uploadPhotoMutation, syncUploadLog],
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
      newItems.forEach((item) => {
        uploadLogRef.current.set(item.id, {
          id: item.id,
          fileName: item.file.name,
          status: 'uploading',
          uploadedAt: new Date().toISOString(),
        });
      });
      syncUploadLog();

      pendingQueueRef.current.push(...newItems);
      processQueue();
    },
    [processQueue, syncUploadLog],
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

  // Get upload log entries (for UploadLog component)
  // Note: Don't filter out 'indexed' - they'll be removed after 3 second delay
  const uploadLogEntries = Array.from(uploadLogRef.current.values());

  return {
    // Actions
    addFiles,
    retryUpload,
    removeFromQueue,

    // State for UI (queue)
    uploadingItems,
    failedItems,
    uploadingCount,
    failedCount,
    isUploading: uploadingCount > 0,

    // State for UI (upload log)
    uploadLogEntries,
  };
}
