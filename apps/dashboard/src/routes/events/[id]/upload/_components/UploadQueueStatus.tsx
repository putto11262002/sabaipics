import { Loader2 } from 'lucide-react';
import { Progress } from '@sabaipics/uiv3/components/progress';
import type { UploadQueueItem } from './useUploadQueue';

interface UploadQueueStatusProps {
  items: UploadQueueItem[];
  totalBatchSize: number;
}

export function UploadQueueStatus({ items, totalBatchSize }: UploadQueueStatusProps) {
  if (items.length === 0) return null;

  const completed = totalBatchSize - items.length;
  const progress = totalBatchSize > 0 ? Math.round((completed / totalBatchSize) * 100) : 0;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
      <div className="flex-1 space-y-1.5">
        <p className="text-sm font-medium">
          Uploading {items.length} photo{items.length !== 1 ? 's' : ''}...
        </p>
        <Progress value={progress} className="h-1.5" />
      </div>
    </div>
  );
}
