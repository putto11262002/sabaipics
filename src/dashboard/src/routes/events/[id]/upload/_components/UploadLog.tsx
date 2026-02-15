import { CheckCircle, Loader2, AlertCircle, Upload, Users, HardDrive, Clock } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/components/ui/table';
import { Skeleton } from '@/ui/components/ui/skeleton';
import type { UploadLogEntry } from './useUploadQueue';

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
          {entries.map((entry) => (
            <UploadLogRow key={entry.id} entry={entry} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface UploadLogRowProps {
  entry: UploadLogEntry;
}

function UploadLogRow({ entry }: UploadLogRowProps) {
  const isOptimistic = /^\d+-/.test(entry.id);

  const getStatusDisplay = () => {
    // Optimistic - not yet on server
    if (isOptimistic) {
      return {
        icon: <Clock className="size-4 text-muted-foreground" />,
        text: 'Queued',
      };
    }

    switch (entry.status) {
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
          text: entry.error || 'Failed',
        };
      default:
        return {
          icon: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
          text: 'Processing...',
        };
    }
  };

  const status = getStatusDisplay();

  return (
    <TableRow>
      {/* Image */}
      <TableCell>
        {entry.thumbnailUrl ? (
          <img
            src={entry.thumbnailUrl}
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
        {entry.status === 'uploading' || entry.status === 'indexing' ? (
          <Skeleton className="h-6 w-16 ml-auto" />
        ) : entry.fileSize ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <HardDrive className="size-4" />
            <span>{formatFileSize(entry.fileSize)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Face Count */}
      <TableCell className="text-right">
        {entry.status === 'uploading' || entry.status === 'indexing' ? (
          <Skeleton className="h-6 w-16 ml-auto" />
        ) : entry.faceCount !== undefined ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <Users className="size-4" />
            <span>{entry.faceCount}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
    </TableRow>
  );
}
