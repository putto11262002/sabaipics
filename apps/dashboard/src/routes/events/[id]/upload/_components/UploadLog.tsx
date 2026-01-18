import { useMemo, useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertCircle, Upload, Users, HardDrive, Clock } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sabaipics/ui/components/table';
import { Skeleton } from '@sabaipics/ui/components/skeleton';
import { usePhotosStatus, type PhotoStatus } from '../../../../../hooks/photos/usePhotoStatus';
import { usePhotos, type Photo } from '../../../../../hooks/photos/usePhotos';
import { useUploadLogState, type UploadLogEntry } from './useUploadLogState';

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface UploadLogProps {
  eventId: string;
}

export function UploadLog({ eventId }: UploadLogProps) {
  const queryClient = useQueryClient();

  // Fetch existing photos from API (only on mount)
  const photosQuery = usePhotos({
    eventId,
    status: ['uploading', 'indexing', 'failed'],
  });

  // Get initial photos from API
  const initialPhotos = useMemo(
    () => photosQuery.data?.pages.flatMap((page: { data: Photo[] }) => page.data) ?? [],
    [photosQuery.data],
  );

  // Local upload log state
  const { entries, pollableIds, addEntry, updateEntry, updateFromPolling, removeEntry } = useUploadLogState({
    eventId,
    initialPhotos,
  });

  // Expose actions to window so useUploadQueue can call them
  useEffect(() => {
    (window as any).__uploadLogActions = {
      addEntry,
      updateEntry,
    };
    return () => {
      delete (window as any).__uploadLogActions;
    };
  }, [addEntry, updateEntry]);

  // Track whether we should poll
  const [shouldPoll, setShouldPoll] = useState(true);

  // Batch fetch photo statuses
  const { data: statuses, isLoading } = usePhotosStatus(pollableIds, {
    refetchInterval: shouldPoll ? 2000 : false,
  });

  // Update entries from polling
  useEffect(() => {
    if (!statuses) return;

    updateFromPolling(
      statuses.map((s) => ({
        id: s.id,
        status: s.status,
        thumbnailUrl: s.thumbnailUrl,
        fileSize: s.fileSize,
        faceCount: s.faceCount,
      }))
    );
  }, [statuses, updateFromPolling]);

  // Stop polling when all photos reach terminal state
  useEffect(() => {
    if (!statuses || statuses.length < pollableIds.length) {
      setShouldPoll(true);
      return;
    }

    const hasProcessing = statuses.some(
      (s) => s.status !== 'indexed' && s.status !== 'failed',
    );
    setShouldPoll(hasProcessing);
  }, [statuses, pollableIds.length]);

  // Remove indexed entries and invalidate cache
  useEffect(() => {
    if (!statuses) return;

    const indexedPhotos = statuses.filter((s) => s.status === 'indexed');

    if (indexedPhotos.length > 0) {
      indexedPhotos.forEach((p) => removeEntry(p.id));

      // Invalidate photos query to refresh gallery
      queryClient.invalidateQueries({
        queryKey: ['event', eventId, 'photos'],
      });
    }
  }, [statuses, eventId, queryClient, removeEntry]);

  // Create a map for quick status lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, PhotoStatus>();
    statuses?.forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Upload Log</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Image</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-24 text-right">Faces</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const polledStatus = statusMap.get(entry.id);
            return (
              <UploadLogRow
                key={entry.id}
                entry={entry}
                polledStatus={polledStatus}
                isLoadingStatus={isLoading && pollableIds.includes(entry.id)}
              />
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

interface UploadLogRowProps {
  entry: UploadLogEntry;
  polledStatus: PhotoStatus | undefined;
  isLoadingStatus: boolean;
}

function UploadLogRow({ entry, polledStatus, isLoadingStatus }: UploadLogRowProps) {
  const isOptimistic = /^\d+-/.test(entry.id);

  const getStatusDisplay = () => {
    // Optimistic - not yet on server
    if (isOptimistic) {
      return {
        icon: <Clock className="size-4 text-muted-foreground" />,
        text: 'Queued',
      };
    }

    // Use polled status if available, otherwise use entry.status
    const currentStatus = polledStatus?.status ?? entry.status;

    if (isLoadingStatus && !currentStatus) {
      return {
        icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
        text: 'Processing...',
      };
    }

    switch (currentStatus) {
      case 'uploading':
        return {
          icon: <Upload className="size-4 animate-pulse text-blue-500" />,
          text: 'Uploading...',
        };
      case 'indexing':
        return {
          icon: <Loader2 className="size-4 animate-spin text-amber-500" />,
          text: 'Indexing faces...',
        };
      case 'indexed':
        return {
          icon: <CheckCircle className="size-4 text-green-500" />,
          text: 'Indexed',
        };
      case 'failed':
        return {
          icon: <AlertCircle className="size-4 text-destructive" />,
          text: entry.error || (polledStatus?.errorName || 'Failed'),
        };
      default:
        return {
          icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
          text: 'Processing...',
        };
    }
  };

  const status = getStatusDisplay();

  // Use polled data if available, otherwise use entry data
  const thumbnailUrl = polledStatus?.thumbnailUrl ?? entry.thumbnailUrl;
  const fileSize = polledStatus?.fileSize ?? entry.fileSize;
  const faceCount = polledStatus?.faceCount ?? entry.faceCount;
  const currentStatus = polledStatus?.status ?? entry.status;

  return (
    <TableRow>
      {/* Image */}
      <TableCell>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={entry.fileName || `Photo ${entry.id.slice(0, 8)}`}
            className="size-12 rounded object-cover"
          />
        ) : (
          <div className="size-12 rounded bg-muted flex items-center justify-center">
            {isOptimistic ? (
              <Clock className="size-4 text-muted-foreground" />
            ) : (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <div className="flex items-center gap-2">
          {status.icon}
          <span className="text-sm">{status.text}</span>
        </div>
      </TableCell>

      {/* File Size */}
      <TableCell className="text-right">
        {currentStatus === 'uploading' || currentStatus === 'indexing' ? (
          <Skeleton className="h-6 w-16 ml-auto" />
        ) : fileSize ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <HardDrive className="size-4" />
            <span>{formatFileSize(fileSize)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Face Count */}
      <TableCell className="text-right">
        {currentStatus === 'uploading' || currentStatus === 'indexing' ? (
          <Skeleton className="h-6 w-16 ml-auto" />
        ) : faceCount !== undefined ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <Users className="size-4" />
            <span>{faceCount}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}
