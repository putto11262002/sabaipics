import { useState, useCallback } from 'react';
import { Download, Check, RefreshCw, Image } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { ButtonGroup } from '@/shared/components/ui/button-group';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Spinner } from '@/shared/components/ui/spinner';
import { th } from '../lib/i18n';
import { LineDeliveryButton } from './LineDeliveryButton';
import { useLineStatus } from '@/shared/hooks/rq/line/use-line-status';
import { useDownloadBulk } from '@/shared/hooks/rq/downloads/use-download-bulk';

interface ResultPhoto {
  photoId: string;
  thumbnailUrl: string;
  previewUrl: string;
  similarity: number;
}

interface ResultsStepProps {
  eventId: string;
  searchId: string;
  photos: ResultPhoto[];
  onSearchAgain: () => void;
}

export function ResultsStep({ eventId, searchId, photos, onSearchAgain }: ResultsStepProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(photos.map((p) => p.photoId)),
  );
  const { data: lineStatus } = useLineStatus({ eventId });
  const { mutateAsync: downloadAsync, isPending: isDownloadPending } = useDownloadBulk();

  const toggleSelection = useCallback((photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const handleDownloadSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;

    try {
      const blob = await downloadAsync({ eventId, photoIds: Array.from(selectedIds) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `photos-${eventId.slice(0, 8)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(th.results.downloadSuccess);
    } catch {
      toast.error(th.results.downloadError.title, {
        description: th.results.downloadError.description,
      });
    }
  }, [eventId, selectedIds, downloadAsync]);

  const lineAvailable = lineStatus?.available ?? false;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-background px-4 py-4">
        <Button variant="outline" size="sm" onClick={onSearchAgain}>
          <RefreshCw className="mr-1 size-4" />
          {th.results.searchAgain}
        </Button>
        <Button variant="ghost" size="sm">
          <Image className="mr-1 size-4" />
          {photos.length}
        </Button>
      </div>

      {/* Hint Alert */}
      <div className="px-4 pb-4">
        <Alert>
          <AlertDescription>{th.results.hint}</AlertDescription>
        </Alert>
      </div>

      {/* Photo Grid */}
      <div className="flex-1 px-2 pb-20">
        <div className="grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {photos.map((photo) => {
            const isSelected = selectedIds.has(photo.photoId);
            return (
              <button
                key={photo.photoId}
                type="button"
                className="group relative aspect-square cursor-pointer overflow-hidden rounded"
                onClick={() => toggleSelection(photo.photoId)}
              >
                <img
                  src={photo.thumbnailUrl}
                  alt=""
                  className="size-full object-cover transition-all"
                />
                {/* Dark overlay when selected */}
                {isSelected && (
                  <div className="absolute inset-0 z-5 bg-black/30" />
                )}
                {/* Selection indicator - top right */}
                {isSelected && (
                  <div className="absolute right-2 top-2 z-10 rounded-full bg-primary p-1.5">
                    <Check className="size-4 text-primary-foreground" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky Bottom Bar */}
      <div className="sticky bottom-0 z-30 border-t bg-background px-4 py-3">
        <ButtonGroup className="w-full">
          <Button
            className="flex-1"
            onClick={handleDownloadSelected}
            disabled={isDownloadPending || selectedIds.size === 0}
          >
            {isDownloadPending ? (
              <Spinner className="mr-1 size-4" />
            ) : (
              <Download className="mr-1 size-4" />
            )}
            {th.results.download(selectedIds.size)}
          </Button>
          {lineAvailable && (
            <LineDeliveryButton
              eventId={eventId}
              searchId={searchId}
              selectedIds={selectedIds}
            />
          )}
        </ButtonGroup>
      </div>
    </div>
  );
}
