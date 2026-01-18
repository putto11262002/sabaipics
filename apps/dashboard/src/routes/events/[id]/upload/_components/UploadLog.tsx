import { useMemo, useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertCircle, Upload, Users, HardDrive } from 'lucide-react';
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
import { usePhotosStatus, type PhotoStatus } from '../../../../../hooks/photos/usePhotoStatus';
import { usePhotos, type Photo } from '../../../../../hooks/photos/usePhotos';

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

  // Fetch photos that are NOT indexed (uploading, indexing, failed)
  const photosQuery = usePhotos({
    eventId,
    status: ['uploading', 'indexing', 'failed'],
  });

  // Get all API photos from all pages
  const photos = useMemo(
    () => photosQuery.data?.pages.flatMap((page: { data: Photo[] }) => page.data) ?? [],
    [photosQuery.data],
  );

  // Extract photo IDs that need status polling (uploaded but not yet indexed)
  // Skip optimistic updates (temp IDs like "1234567890-abc")
  const photoIdsToTrack = useMemo(
    () =>
      photos
        .filter((p) => {
          // Optimistic IDs are timestamps like "1737184532123-abc4", not real UUIDs
          const isOptimistic = /^\d+-/.test(p.id);
          return !isOptimistic && p.status && p.status !== 'indexed' && p.status !== 'failed';
        })
        .map((p) => p.id),
    [photos],
  );

  // Track whether we should poll
  const [shouldPoll, setShouldPoll] = useState(true);

  // Batch fetch photo statuses
  const { data: statuses, isLoading } = usePhotosStatus(photoIdsToTrack, {
    refetchInterval: shouldPoll ? 2000 : false,
  });

  // Stop polling when all photos reach terminal state
  useEffect(() => {
    if (!statuses || statuses.length < photoIdsToTrack.length) {
      setShouldPoll(true);
      return;
    }

    const hasProcessing = statuses.some(
      (s) => s.status !== 'indexed' && s.status !== 'failed',
    );
    setShouldPoll(hasProcessing);
  }, [statuses, photoIdsToTrack.length]);

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

  // Create a map for quick status lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, PhotoStatus>();
    statuses?.forEach((s) => map.set(s.id, s));
    return map;
  }, [statuses]);

  if (photos.length === 0) {
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
          {photos.map((photo) => {
            const polledStatus = statusMap.get(photo.id);
            return (
              <UploadLogRow
                key={photo.id}
                photo={photo}
                polledStatus={polledStatus}
                isLoadingStatus={isLoading && photoIdsToTrack.includes(photo.id)}
              />
            );
          })}
        </TableBody>
      </Table>

      {/* Load More Button for API photos */}
      {photosQuery.hasNextPage && (
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
  photo: Photo;
  polledStatus: PhotoStatus | undefined;
  isLoadingStatus: boolean;
}

function UploadLogRow({ photo, polledStatus, isLoadingStatus }: UploadLogRowProps) {
  const getStatusDisplay = () => {
    // Use polled status if available, otherwise use photo.status
    const currentStatus = polledStatus?.status ?? photo.status;

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
          text: polledStatus?.errorName || 'Failed',
        };
      default:
        return {
          icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
          text: 'Processing...',
        };
    }
  };

  const status = getStatusDisplay();

  // Use polled data if available, otherwise use photo data
  const thumbnailUrl = polledStatus?.thumbnailUrl ?? photo.thumbnailUrl;
  const fileSize = polledStatus?.fileSize ?? photo.fileSize;
  const faceCount = polledStatus?.faceCount ?? photo.faceCount;
  const currentStatus = polledStatus?.status ?? photo.status;

  return (
    <TableRow>
      {/* Image */}
      <TableCell>
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={`Photo ${photo.id.slice(0, 8)}`}
            className="size-12 rounded object-cover"
          />
        ) : (
          <div className="size-12 rounded bg-muted flex items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
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
