import { useMemo, useState, useEffect } from 'react';
import { CheckCircle, Loader2, AlertCircle, Upload, Users, HardDrive } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sabaipics/ui/components/table';
import { Skeleton } from '@sabaipics/ui/components/skeleton';
import type { UploadLogEntry } from '../../types/upload';
import { usePhotosStatus, type PhotoStatus } from '../../hooks/photos/usePhotoStatus';

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

interface UploadLogProps {
  entries: UploadLogEntry[];
}

export function UploadLog({ entries }: UploadLogProps) {
  // Extract photo IDs for batch fetch (only for entries that have completed upload)
  const photoIds = useMemo(
    () => entries.filter((e) => e.photoId).map((e) => e.photoId!),
    [entries],
  );

  // Track whether we should poll
  const [shouldPoll, setShouldPoll] = useState(true);

  // Batch fetch photo statuses
  const { data: statuses, isLoading } = usePhotosStatus(photoIds, {
    refetchInterval: shouldPoll ? 2000 : false,
  });

  // Stop polling when all photos reach terminal state
  useEffect(() => {
    const hasLocalUploading = entries.some((e) => e.uploadStatus === 'uploading');
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

  // Create a map for quick lookup
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
            const photoStatus = entry.photoId ? statusMap.get(entry.photoId) : undefined;
            return (
              <UploadLogRow
                key={entry.id}
                entry={entry}
                photoStatus={photoStatus}
                isLoadingStatus={isLoading && !!entry.photoId}
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
  photoStatus: PhotoStatus | undefined;
  isLoadingStatus: boolean;
}

function UploadLogRow({ entry, photoStatus, isLoadingStatus }: UploadLogRowProps) {
  const getStatusDisplay = () => {
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

    // Upload succeeded, now check server processing status
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
  const faceCount = photoStatus?.faceCount;

  return (
    <TableRow>
      {/* Image */}
      <TableCell>
        {photoStatus?.thumbnailUrl ? (
          <img
            src={photoStatus.thumbnailUrl}
            alt={entry.fileName}
            className="size-12 rounded object-cover"
          />
        ) : (
          <div className="size-12 rounded bg-muted flex items-center justify-center">
            {entry.uploadStatus === 'uploading' ? (
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
        {photoStatus?.status === 'uploading' || photoStatus?.status === 'indexing' ? (
          <Skeleton className="h-6 w-16 ml-auto" />
        ) : photoStatus?.fileSize ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <HardDrive className="size-4" />
            <span>{formatFileSize(photoStatus.fileSize)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Face Count */}
      <TableCell className="text-right">
        {photoStatus?.status === 'uploading' || photoStatus?.status === 'indexing' ? (
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
