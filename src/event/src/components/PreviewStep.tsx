import { ChevronLeft } from 'lucide-react';
import { Button } from '@/ui-legacy/components/ui/button';
import { AspectRatio } from '@/ui-legacy/components/ui/aspect-ratio';
import { th } from '../lib/i18n';

interface PreviewStepProps {
  previewUrl: string;
  onSearch: () => void;
  onRetake: () => void;
  onBack: () => void;
}

export function PreviewStep({ previewUrl, onSearch, onRetake, onBack }: PreviewStepProps) {
  return (
    <div className="relative min-h-screen">
      {/* Back Button - Fixed at top */}
      <div className="absolute left-6 top-6">
        <Button variant="outline" size="sm" onClick={onBack}>
          <ChevronLeft className="mr-1 size-4" />
          {th.common.back}
        </Button>
      </div>

      {/* Centered Content */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-20">
        <div className="w-full max-w-sm space-y-6">
          {/* Title */}
          <h1 className="text-center text-xl font-semibold">{th.preview.title}</h1>

          {/* Image Preview */}
          <div className="overflow-hidden rounded-xl border bg-muted">
            <AspectRatio ratio={1}>
              <img src={previewUrl} alt="Selfie preview" className="h-full w-full object-cover" />
            </AspectRatio>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button size="lg" className="w-full" onClick={onSearch}>
              {th.preview.search}
            </Button>
            <Button variant="outline" size="lg" className="w-full" onClick={onRetake}>
              {th.preview.retake}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
