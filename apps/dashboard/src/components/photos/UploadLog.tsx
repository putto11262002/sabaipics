import { useMemo, useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertCircle, Upload, Users, HardDrive, Clock } from 'lucide-react';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
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
import { Button } from '@sabaipics/ui/components/button';
import type { UploadLogEntry } from '../../types/upload';
import { usePhotosStatus, type PhotoStatus } from '../../hooks/photos/usePhotoStatus';
import type { Photo } from '../../hooks/photos/usePhotos';

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Extended log entry that can represent either a local upload or an API photo
interface ExtendedLogEntry extends UploadLogEntry {
  isApiPhoto?: boolean;
  apiPhoto?: Photo;
}

interface UploadLogProps {
  entries: UploadLogEntry[];
  photosQuery?: UseInfiniteQueryResult<any, Error>;
  eventId: string;
}

export function UploadLog({ entries, photosQuery, eventId }: UploadLogProps) {
  const queryClient = useQueryClient();
  // Get all API photos from all pages
  const apiPhotos = useMemo(
    () => photosQuery?.data?.pages.flatMap((page: { data: Photo[] }) => page.data) ?? [],
    [photosQuery?.data],
  );

  // Merge local entries and API photos into a unified list
  const mergedEntries = useMemo((): ExtendedLogEntry[] => {
    // Create a set of photo IDs already in local entries
    const localPhotoIds = new Set(entries.filter(e => e.photoId).map(e => e.photoId));

    // Convert API photos to log entries (exclude ones already in local entries)
    const apiEntries: ExtendedLogEntry[] = apiPhotos
      .filter((photo: Photo) => !localPhotoIds.has(photo.id))
      .map((photo: Photo): ExtendedLogEntry => ({
        id: photo.id,
        fileName: `Photo ${photo.id.slice(0, 8)}`,
        uploadStatus: 'uploaded',
        photoId: photo.id,
        queuedAt: new Date(photo.uploadedAt).getTime(),
        startedAt: new Date(photo.uploadedAt).getTime(),
        isApiPhoto: true,
        apiPhoto: photo,
      }));

    // Combine and sort by timestamp (latest first)
    // Use queuedAt as the primary sort key since all entries have it
    return [...entries, ...apiEntries].sort((a, b) => b.queuedAt - a.queuedAt);
  }, [entries, apiPhotos]);

  // Extract photo IDs for batch fetch (only for local entries that need status updates)
  const photoIds = useMemo(
    () => entries.filter((e) => e.photoId).map((e) => e.photoId!),
    [entries],
  );

  // Track whether we should poll
  const [shouldPoll, setShouldPoll] = useState(true);

  // Batch fetch photo statuses (for local entries)
  const { data: statuses, isLoading } = usePhotosStatus(photoIds, {
    refetchInterval: shouldPoll ? 2000 : false,
  });

  // Stop polling when all photos reach terminal state
  useEffect(() => {
    const hasLocalUploading = entries.some((e) => e.uploadStatus === 'queued' || e.uploadStatus === 'uploading');
    if (hasLocalUploading) {
      setShouldPoll(true);
      return;
    }

    if (!statuses || statuses.length < photoIds.length) {
      setShouldPoll(true);
      return;
    }

    const hasProcessing = statuses.some(
      (s) => s.status !== 'indexed' && s.status !== 'failed',
    );
    setShouldPoll(hasProcessing);
  }, [entries, statuses, photoIds.length]);

  // Invalidate photos cache when any photo becomes indexed
  useEffect(() => {
    if (!statuses) return;

    const indexedPhotos = statuses.filter((s) => s.status === 'indexed');

    if (indexedPhotos.length > 0) {
      queryClient.invalidateQueries({
        queryKey: ['event', eventId, 'photos'],
      });
    }
  }, [statuses, eventId, queryClient]);

  // Create a map for quick lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, PhotoStatus>();
    statuses?.forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses]);

  if (mergedEntries.length === 0) {
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
          {mergedEntries.map((entry) => {
            const photoStatus = entry.photoId ? statusMap.get(entry.photoId) : undefined;
            return (
              <UploadLogRow
                key={entry.id}
                entry={entry}
                photoStatus={photoStatus}
                isLoadingStatus={isLoading && !!entry.photoId && !entry.isApiPhoto}
              />
            );
          })}
        </TableBody>
      </Table>

      {/* Load More Button for API photos */}
      {photosQuery?.hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            onClick={() => photosQuery.fetchNextPage()}
            disabled={photosQuery.isFetchingNextPage}
            variant="outline"
            size="sm"
          >
            {photosQuery.isFetchingNextPage ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}

interface UploadLogRowProps {
  entry: ExtendedLogEntry;
  photoStatus: PhotoStatus | undefined;
  isLoadingStatus: boolean;
}

function UploadLogRow({ entry, photoStatus, isLoadingStatus }: UploadLogRowProps) {
  // For API photos, use their data directly
  const apiPhoto = entry.isApiPhoto ? entry.apiPhoto : undefined;

  const getStatusDisplay = () => {
    // Queued status - waiting to start
    if (entry.uploadStatus === 'queued') {
      return {
        icon: <Clock className="size-4 text-muted-foreground" />,
        text: 'Queued',
      };
    }

    // Local upload in progress
    if (entry.uploadStatus === 'uploading') {
      return {
        icon: <Upload className="size-4 animate-pulse text-blue-500" />,
        text: 'Uploading...',
      };
    }

    // Local upload failed
    if (entry.uploadStatus === 'failed') {
      return {
        icon: <AlertCircle className="size-4 text-destructive" />,
        text: entry.uploadError || 'Upload failed',
      };
    }

    // For API photos, use their status directly
    if (apiPhoto) {
      switch (apiPhoto.status) {
        case 'uploading':
          return {
            icon: <Loader2 className="size-4 animate-spin text-blue-500" />,
            text: 'Processing...',
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
            text: 'Failed',
          };
        default:
          return {
            icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
            text: 'Processing...',
          };
      }
    }

    // Upload succeeded, now check server processing status (for local entries)
    if (isLoadingStatus || !photoStatus) {
      return {
        icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
        text: 'Processing...',
      };
    }

    switch (photoStatus.status) {
      case 'uploading':
        return {
          icon: <Loader2 className="size-4 animate-spin text-blue-500" />,
          text: 'Processing...',
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
          text: photoStatus.errorName || 'Failed',
        };
      default:
        return {
          icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
          text: 'Processing...',
        };
    }
  };

  const status = getStatusDisplay();

  // Use API photo data if available, otherwise use photoStatus
  const thumbnailUrl = apiPhoto?.thumbnailUrl ?? photoStatus?.thumbnailUrl;
  const fileSize = apiPhoto?.fileSize ?? photoStatus?.fileSize;
  const faceCount = apiPhoto?.faceCount ?? photoStatus?.faceCount;
  const photoStatusValue = apiPhoto?.status ?? photoStatus?.status;

  return (
    <TableRow>
      {/* Image */}
      <TableCell>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={entry.fileName}
            className="size-12 rounded object-cover"
          />
        ) : (
          <div className="size-12 rounded bg-muted flex items-center justify-center">
            {entry.uploadStatus === 'queued' ? (
              <Clock className="size-4 text-muted-foreground" />
            ) : entry.uploadStatus === 'uploading' ? (
              <Upload className="size-4 animate-pulse text-muted-foreground" />
            ) : entry.uploadStatus === 'failed' ? (
              <AlertCircle className="size-4 text-destructive" />
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
        {photoStatusValue === 'uploading' || photoStatusValue === 'indexing' ? (
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
        {photoStatusValue === 'uploading' || photoStatusValue === 'indexing' ? (
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
