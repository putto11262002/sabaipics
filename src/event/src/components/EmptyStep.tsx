import { ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { th } from '../lib/i18n';

interface EmptyStepProps {
  onRetry: () => void;
}

export function EmptyStep({ onRetry }: EmptyStepProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Empty className="border-none">
        <EmptyHeader>
          <EmptyMedia>
            <ImageOff className="size-8 text-muted-foreground" />
          </EmptyMedia>
          <EmptyTitle>{th.empty.title}</EmptyTitle>
          <EmptyDescription>{th.empty.description}</EmptyDescription>
        </EmptyHeader>
        <Button size="sm" onClick={onRetry}>
          <RefreshCw className="mr-1" />
          {th.empty.retry}
        </Button>
      </Empty>
    </div>
  );
}
