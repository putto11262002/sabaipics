import { useRef, useState, useCallback, useEffect } from 'react';
import { usePresignedUpload } from '../../../../../hooks/photos/usePresignedUpload';
import {
  useUploadIntentStatus,
  type MappedUploadIntent,
} from '../../../../../hooks/photos/useUploadIntentStatus';
import { usePhotos, type Photo } from '../../../../../hooks/photos/usePhotos';
import { usePhotosStatus, type PhotoStatus } from '../../../../../hooks/photos/usePhotoStatus';

export interface UploadQueueItem {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'uploaded' | 'failed';
  progress?: number;
  error?: string;
  errorStatus?: number;
  uploadId?: string; // Set after presign succeeds (v2 flow)
  photoId?: string; // Set when processing completes (from intent status)
}

export interface UploadLogEntry {
  id: string;
  fileName?: string;
  status: 'uploading' | 'indexing' | 'indexed' | 'failed';
  thumbnailUrl?: string;
  fileSize?: number | null | undefined;
  faceCount?: number | null | undefined;
  error?: string;
  uploadedAt: string;
  // Track uploadId for entries still waiting for photoId
  uploadId?: string;
}

const MAX_TOKENS = 5;

export function useUploadQueue(eventId: string | undefined) {
  const presignedUploadMutation = usePresignedUpload();

  // Fetch existing photos from API (uploading/indexing/failed)
  const photosQuery = usePhotos({
    eventId,
    status: ['uploading', 'indexing', 'failed'],
  });

  // Upload log state (single source of truth)
  const uploadLogRef = useRef<Map<string, UploadLogEntry>>(new Map());
  const indexedForRemovalRef = useRef<Set<string>>(new Set()); // Track entries scheduled for removal
  const [, setUploadLogVersion] = useState(0); // Force re-renders

  // Track upload intent IDs for polling (Phase 1: until completed)
  const pendingIntentIdsRef = useRef<Set<string>>(new Set());
  // Map uploadId -> temp log entry id (for replacing when photoId is received)
  const uploadIdToLogIdRef = useRef<Map<string, string>>(new Map());

  // Initialize upload log with photos from API
  useEffect(() => {
    if (!photosQuery.data) return;

    const initialPhotos = photosQuery.data.pages.flatMap((page: { data: Photo[] }) => page.data);
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

  // =========================================================================
  // Phase 1: Poll upload intents until completed (get photoId)
  // =========================================================================
  const pendingIntentIds = Array.from(pendingIntentIdsRef.current);

  const { data: intentStatuses } = useUploadIntentStatus(pendingIntentIds, {
    refetchInterval: pendingIntentIds.length > 0 ? 2000 : false,
  });

  // Process intent status updates
  useEffect(() => {
    if (!intentStatuses) return;

    intentStatuses.forEach((intent: MappedUploadIntent) => {
      const logEntryId = uploadIdToLogIdRef.current.get(intent.uploadId);
      if (!logEntryId) return;

      const existing = uploadLogRef.current.get(logEntryId);
      if (!existing) return;

      if (intent.status === 'completed' && intent.photoId) {
        // Intent completed - replace temp entry with photo entry
        uploadLogRef.current.delete(logEntryId);
        uploadIdToLogIdRef.current.delete(intent.uploadId);
        pendingIntentIdsRef.current.delete(intent.uploadId);

        // Create new entry with real photoId
        // Photo starts at 'uploading' status, will be updated by photo status polling
        uploadLogRef.current.set(intent.photoId, {
          id: intent.photoId,
          fileName: existing.fileName,
          status: 'uploading',
          fileSize: existing.fileSize,
          uploadedAt: existing.uploadedAt,
        });
      } else if (intent.status === 'failed') {
        // Intent failed - update log entry
        uploadLogRef.current.set(logEntryId, {
          ...existing,
          status: 'failed',
          error: intent.errorMessage || 'Processing failed',
        });
        pendingIntentIdsRef.current.delete(intent.uploadId);
        uploadIdToLogIdRef.current.delete(intent.uploadId);
      }
      // intent.status === 'uploading' - no action needed, keep polling
    });

    setUploadLogVersion((v) => v + 1);
  }, [intentStatuses]);

  // =========================================================================
  // Phase 2: Poll photo statuses for face indexing (existing behavior)
  // =========================================================================
  const pollablePhotoIds = Array.from(uploadLogRef.current.values())
    .filter((e) => {
      const isOptimistic = /^\d+-/.test(e.id);
      const hasPendingIntent = e.uploadId && pendingIntentIdsRef.current.has(e.uploadId);
      return !isOptimistic && !hasPendingIntent && e.status !== 'indexed' && e.status !== 'failed';
    })
    .map((e) => e.id);

  const { data: photoStatuses } = usePhotosStatus(pollablePhotoIds, {
    refetchInterval: pollablePhotoIds.length > 0 ? 2000 : false,
  });

  // Update upload log from photo status polling
  useEffect(() => {
    if (!photoStatuses) return;

    photoStatuses.forEach((status: PhotoStatus) => {
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
  }, [photoStatuses]);

  // Remove indexed entries from upload log after 3 second delay
  useEffect(() => {
    if (!photoStatuses) return;

    const indexedPhotos = photoStatuses.filter((s: PhotoStatus) => s.status === 'indexed');
    if (indexedPhotos.length === 0) return;

    // Set timeouts for each indexed photo that isn't already scheduled
    indexedPhotos
      .filter((p: PhotoStatus) => !indexedForRemovalRef.current.has(p.id))
      .forEach((p: PhotoStatus) => {
        // Mark as scheduled for removal
        indexedForRemovalRef.current.add(p.id);

        setTimeout(() => {
          uploadLogRef.current.delete(p.id);
          indexedForRemovalRef.current.delete(p.id); // Clean up tracking
          setUploadLogVersion((v) => v + 1);
        }, 3000); // 3 second delay to show "Indexed" status
      });
    // Note: No cleanup function - let timeouts fire naturally
  }, [photoStatuses]);

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

  // Upload a single file using presigned URL flow
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
        // Presigned upload: get presigned URL and upload to R2
        const result = await presignedUploadMutation.mutateAsync({
          eventId,
          file: item.file,
        });

        // Success - store uploadId for intent polling
        item.uploadId = result.uploadId;
        activeUploadsRef.current.delete(item.id);

        // Update upload log - now waiting for intent completion
        uploadLogRef.current.set(item.id, {
          ...uploadLogRef.current.get(item.id)!,
          status: 'indexing', // R2 upload done, now processing in queue
          uploadId: result.uploadId,
        });

        // Track for intent polling (Phase 1)
        pendingIntentIdsRef.current.add(result.uploadId);
        uploadIdToLogIdRef.current.set(result.uploadId, item.id);

        syncUploadLog();
      } catch (error) {
        const err = error as Error & { status?: number };
        let errorMessage = err.message || 'Upload failed';

        // Fallback mapping if message wasn't set from API
        if (errorMessage === 'Upload failed') {
          if (err.status === 402) {
            errorMessage = 'Insufficient credits';
          } else if (err.status === 410) {
            errorMessage = 'Event expired';
          } else if (err.status === 409) {
            errorMessage = 'Upload already processing';
          }
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
    [eventId, presignedUploadMutation, syncUploadLog],
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
      item.uploadId = undefined; // Clear old uploadId for fresh presign

      // Reset upload log entry
      uploadLogRef.current.set(itemId, {
        ...uploadLogRef.current.get(itemId)!,
        status: 'uploading',
        error: undefined,
        uploadId: undefined,
      });
      syncUploadLog();

      pendingQueueRef.current.push(item);
      processQueue();
    },
    [processQueue, syncUploadLog],
  );

  // Remove a failed upload
  const removeFromQueue = useCallback(
    (itemId: string) => {
      const item = failedUploadsRef.current.get(itemId);
      if (item?.uploadId) {
        // Clean up tracking refs
        pendingIntentIdsRef.current.delete(item.uploadId);
        uploadIdToLogIdRef.current.delete(item.uploadId);
      }

      failedUploadsRef.current.delete(itemId);
      uploadLogRef.current.delete(itemId);
      syncDisplayState();
      syncUploadLog();
    },
    [syncDisplayState, syncUploadLog],
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
