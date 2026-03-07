import { useState, useCallback } from 'react';
import { Download, Check, RefreshCw, Image, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { ButtonGroup } from '@/shared/components/ui/button-group';
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

const MAX_PRESELECT = 5;

/** Check if Web Share API supports sharing image files. */
function canShareFiles(): boolean {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    return navigator.canShare({
      files: [new File([], 'test.jpg', { type: 'image/jpeg' })],
    });
  } catch {
    return false;
  }
}

interface ResultsStepProps {
  eventId: string;
  searchId: string;
  photos: ResultPhoto[];
  onSearchAgain: () => void;
}

export function ResultsStep({ eventId, searchId, photos, onSearchAgain }: ResultsStepProps) {
  // Photos are already sorted by similarity desc from the API
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(photos.slice(0, MAX_PRESELECT).map((p) => p.photoId)),
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const { data: lineStatus, isLoading: isLineLoading } = useLineStatus({ eventId });
  const { mutateAsync: downloadAsync, isPending: isZipPending } = useDownloadBulk();
  const shareSupported = canShareFiles();

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

  const handleShareSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsDownloading(true);

    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.photoId));

      // Fetch all selected photos as files
      const files = await Promise.all(
        selectedPhotos.map(async (photo, i) => {
          const response = await fetch(photo.previewUrl, { cache: 'no-store' });
          const blob = await response.blob();
          return new File([blob], `photo-${i + 1}.jpg`, { type: 'image/jpeg' });
        }),
      );

      await navigator.share({ files });
      toast.success(th.results.downloadSuccess);
    } catch (e) {
      // User cancelled the share sheet — not an error
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(th.results.downloadError.title, {
        description: th.results.downloadError.description,
      });
    } finally {
      setIsDownloading(false);
    }
  }, [selectedIds, photos]);

  const handleZipDownload = useCallback(async () => {
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

  const isPending = isDownloading || isZipPending;
  const lineAvailable = lineStatus?.available ?? false;
  const linePhotoCap = lineStatus?.photoCap ?? null;

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-background px-4 py-4">
        <Button variant="outline" size="sm" onClick={onSearchAgain}>
          <RefreshCw className="mr-1 size-4" />
          {th.results.searchAgain}
        </Button>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
              <X className="mr-1 size-4" />
              {th.results.clearSelection}
            </Button>
          )}
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Image className="size-4" />
            {selectedIds.size > 0
              ? th.results.selected(selectedIds.size)
              : photos.length}
          </span>
        </div>
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
            onClick={shareSupported ? handleShareSelected : handleZipDownload}
            disabled={isPending || selectedIds.size === 0}
          >
            {isPending ? (
              <Spinner className="mr-1 size-4" />
            ) : shareSupported ? (
              <Share2 className="mr-1 size-4" />
            ) : (
              <Download className="mr-1 size-4" />
            )}
            {th.results.download(selectedIds.size)}
          </Button>
          {isLineLoading ? (
            <div className="h-10 flex-1 animate-pulse rounded-md bg-muted" />
          ) : lineAvailable ? (
            <LineDeliveryButton
              eventId={eventId}
              searchId={searchId}
              selectedIds={selectedIds}
              photoCap={linePhotoCap}
            />
          ) : null}
        </ButtonGroup>
      </div>
    </div>
  );
}
