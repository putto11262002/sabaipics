import { ImageOff } from 'lucide-react';
import { Button } from '@sabaipics/uiv2/components/button';
import { th } from '@/lib/i18n';

interface EmptyStepProps {
  onRetry: () => void;
}

export function EmptyStep({ onRetry }: EmptyStepProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
            <ImageOff className="h-10 w-10 text-muted-foreground" />
          </div>
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{th.empty.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{th.empty.description}</p>
        </div>

        {/* Retry Button */}
        <Button size="lg" className="w-full" onClick={onRetry}>
          {th.empty.retry}
        </Button>
      </div>
    </div>
  );
}
