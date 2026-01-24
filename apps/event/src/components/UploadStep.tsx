import { useRef } from 'react';
import { Camera, ChevronLeft } from 'lucide-react';
import { Button } from '@sabaipics/uiv2/components/button';
// import { Alert, AlertTitle, AlertDescription } from '@sabaipics/uiv2/components/alert';
// import { Lightbulb } from 'lucide-react';
import { th } from '@/lib/i18n';

interface UploadStepProps {
  onFileSelect: (file: File) => void;
  onBack: () => void;
}

export function UploadStep({ onFileSelect, onBack }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

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
          <h1 className="text-center text-xl font-semibold">{th.upload.title}</h1>

          {/* Upload Zone */}
          <button
            type="button"
            onClick={handleClick}
            className="group relative flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/25 bg-muted/30 p-8 transition-colors hover:border-primary hover:bg-primary/5"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
              capture="user"
              onChange={handleChange}
              className="hidden"
            />

            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/20">
              <Camera className="size-8 text-primary" />
            </div>

            <p className="text-sm font-medium">{th.upload.tap}</p>
            <p className="mt-1 text-xs text-muted-foreground">{th.upload.orGallery}</p>
            <p className="mt-3 text-xs text-muted-foreground">{th.upload.format}</p>
          </button>

          {/* Tips Alert - commented out for now
          <Alert>
            <Lightbulb />
            <AlertTitle>{th.upload.tips.title}</AlertTitle>
            <AlertDescription>
              {th.upload.tips.items.join(' • ')}
            </AlertDescription>
          </Alert>
          */}
        </div>
      </div>
    </div>
  );
}
