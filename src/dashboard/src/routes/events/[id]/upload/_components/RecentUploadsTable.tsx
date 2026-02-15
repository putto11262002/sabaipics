import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Users,
  HardDrive,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Globe,
  Server,
  Smartphone,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Button } from '@/shared/components/ui/button';
import { useRecentUploads, type UploadIntent } from '../../../../../hooks/photos/useRecentUploads';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function StatusBadge({ intent }: { intent: UploadIntent }) {
  // Failed/expired intents
  if (intent.status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle />
      </Badge>
    );
  }
  if (intent.status === 'expired') {
    return (
      <Badge variant="outline">
        <Clock />
      </Badge>
    );
  }

  // Photo failed
  if (intent.photo?.status === 'failed') {
    return (
      <Badge variant="destructive">
        <XCircle />
      </Badge>
    );
  }

  // Fully indexed = done
  if (intent.photo?.status === 'indexed') {
    return (
      <Badge variant="success">
        <CheckCircle />
      </Badge>
    );
  }

  // Everything else (pending, uploading, indexing) = loading
  return (
    <Badge variant="info">
      <Loader2 className="animate-spin" />
    </Badge>
  );
}

function SourceBadge({ source }: { source: string | null }) {
  switch (source) {
    case 'ftp':
      return (
        <Badge variant="secondary">
          <Server />
        </Badge>
      );
    case 'ios':
      return (
        <Badge variant="secondary">
          <Smartphone />
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Globe />
        </Badge>
      );
  }
}

interface RecentUploadsTableProps {
  eventId: string;
}

export function RecentUploadsTable({ eventId }: RecentUploadsTableProps) {
  const {
    data,
    isLoading,
    hasNextPage,
    hasPreviousPage,
    goToNextPage,
    goToPreviousPage,
    page,
  } = useRecentUploads(eventId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Recent Uploads</h4>
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16" />
              <TableHead className="w-12">Status</TableHead>
              <TableHead className="w-12">Source</TableHead>
              <TableHead className="w-24 text-right">Size</TableHead>
              <TableHead className="w-20 text-right">Faces</TableHead>
              <TableHead className="w-28 text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="size-12 rounded" /></TableCell>
                <TableCell><Skeleton className="h-5 w-8 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-8 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-10 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Recent Uploads</h4>
        <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
          No uploads yet
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-muted-foreground">Recent Uploads</h4>
      <Table className="min-w-[600px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-16" />
            <TableHead className="w-10" />
            <TableHead className="w-10" />
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-20 text-right">Faces</TableHead>
            <TableHead className="w-28 text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((intent) => (
            <IntentRow key={intent.id} intent={intent} />
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Page {page}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPreviousPage}
            disabled={!hasPreviousPage}
          >
            <ChevronLeft className="mr-1 size-3" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={!hasNextPage}
          >
            Next
            <ChevronRight className="ml-1 size-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function IntentRow({ intent }: { intent: UploadIntent }) {
  const fileSize = intent.photo?.fileSize ?? intent.contentLength;

  return (
    <TableRow>
      {/* Thumbnail */}
      <TableCell>
        {intent.photo?.thumbnailUrl ? (
          <img
            src={intent.photo.thumbnailUrl}
            alt={`Upload ${intent.id.slice(0, 8)}`}
            className="size-12 rounded object-cover"
          />
        ) : (
          <div className="size-12 rounded bg-muted flex items-center justify-center">
            <ImageIcon className="size-4 text-muted-foreground" />
          </div>
        )}
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge intent={intent} />
      </TableCell>

      {/* Source */}
      <TableCell>
        <SourceBadge source={intent.source} />
      </TableCell>

      {/* File Size */}
      <TableCell className="text-right">
        {fileSize ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <HardDrive className="size-3.5" />
            <span className="text-xs">{formatFileSize(fileSize)}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>

      {/* Face Count */}
      <TableCell className="text-right">
        {intent.photo?.status === 'indexed' ? (
          <div className="flex items-center justify-end gap-1.5 text-muted-foreground">
            <Users className="size-3.5" />
            <span className="text-xs">{intent.photo.faceCount}</span>
          </div>
        ) : intent.photo?.status === 'failed' || intent.status === 'failed' || intent.status === 'expired' ? (
          <span className="text-muted-foreground">-</span>
        ) : (
          <Skeleton className="h-5 w-10 ml-auto" />
        )}
      </TableCell>

      {/* Time */}
      <TableCell className="text-right text-xs text-muted-foreground">
        {formatDistanceToNow(new Date(intent.createdAt), { addSuffix: true })}
      </TableCell>
    </TableRow>
  );
}
