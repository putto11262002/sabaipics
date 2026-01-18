import { useRef, useCallback, useState, useEffect } from 'react';
import type { Photo } from '../../../../../hooks/photos/usePhotos';

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

interface UseUploadLogStateOptions {
  eventId: string;
  initialPhotos?: Photo[];
}

export function useUploadLogState({ initialPhotos }: UseUploadLogStateOptions) {
  const uploadLogRef = useRef<Map<string, UploadLogEntry>>(new Map());
  const [, setVersion] = useState(0); // Force re-renders

  // Initialize with existing photos from API
  useEffect(() => {
    if (!initialPhotos) return;

    initialPhotos.forEach((photo) => {
      uploadLogRef.current.set(photo.id, {
        id: photo.id,
        thumbnailUrl: photo.thumbnailUrl,
        fileSize: photo.fileSize,
        faceCount: photo.faceCount,
        status: photo.status,
        uploadedAt: photo.uploadedAt,
      });
    });

    setVersion((v) => v + 1);
  }, [initialPhotos]);

  // Add entry for queued file
  const addEntry = useCallback((tempId: string, fileName: string) => {
    uploadLogRef.current.set(tempId, {
      id: tempId,
      fileName,
      status: 'uploading',
      uploadedAt: new Date().toISOString(),
    });
    setVersion((v) => v + 1);
  }, []);

  // Update entry with server data (after upload completes)
  const updateEntry = useCallback((tempId: string, updates: Partial<UploadLogEntry> & { id?: string }) => {
    const existing = uploadLogRef.current.get(tempId);
    if (!existing) return;

    // If ID changed (temp → real), delete old entry and create new one
    if (updates.id && updates.id !== tempId) {
      uploadLogRef.current.delete(tempId);
      uploadLogRef.current.set(updates.id, { ...existing, ...updates });
    } else {
      uploadLogRef.current.set(tempId, { ...existing, ...updates });
    }

    setVersion((v) => v + 1);
  }, []);

  // Update entry from status polling
  const updateFromPolling = useCallback((updates: Array<{ id: string; status?: string; thumbnailUrl?: string; fileSize?: number | null; faceCount?: number | null; error?: string }>) => {
    updates.forEach((update) => {
      const existing = uploadLogRef.current.get(update.id);
      if (!existing) return;

      uploadLogRef.current.set(update.id, {
        ...existing,
        ...update,
        status: update.status as UploadLogEntry['status'],
      });
    });

    setVersion((v) => v + 1);
  }, []);

  // Remove entry (when photo becomes indexed)
  const removeEntry = useCallback((id: string) => {
    uploadLogRef.current.delete(id);
    setVersion((v) => v + 1);
  }, []);

  // Get all entries as array
  const entries = Array.from(uploadLogRef.current.values());

  // Get entries that should be visible (not indexed)
  const visibleEntries = entries.filter((e) => e.status !== 'indexed');

  // Get IDs for status polling (exclude optimistic/temp IDs)
  const pollableIds = entries
    .filter((e) => {
      const isOptimistic = /^\d+-/.test(e.id);
      return !isOptimistic && e.status !== 'indexed' && e.status !== 'failed';
    })
    .map((e) => e.id);

  return {
    entries: visibleEntries,
    pollableIds,
    addEntry,
    updateEntry,
    updateFromPolling,
    removeEntry,
  };
}
