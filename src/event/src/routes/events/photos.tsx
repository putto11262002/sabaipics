import { useState, useCallback } from 'react';
import { useParams } from 'react-router';
import { Download, Check, Share2, Images } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { useMatchedPhotos } from '@/shared/hooks/rq/photos/use-matched-photos';
import { useDownloadBulk } from '@/shared/hooks/rq/downloads/use-download-bulk';
import { BottomNav } from '../../components/BottomNav';
import { th } from '../../lib/i18n';

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

export function PhotosPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { data: photos, isLoading } = useMatchedPhotos(eventId!);
  const { mutateAsync: downloadAsync, isPending: isZipPending } = useDownloadBulk();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
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

  const selectAll = useCallback(() => {
    if (!photos) return;
    setSelectedIds(new Set(photos.map((p) => p.photoId)));
  }, [photos]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleShareSelected = useCallback(async () => {
    if (selectedIds.size === 0 || !photos) return;
    setIsDownloading(true);

    try {
      const selectedPhotos = photos.filter((p) => selectedIds.has(p.photoId));
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
      if (e instanceof Error && e.name === 'AbortError') return;
      toast.error(th.results.downloadError.title, {
        description: th.results.downloadError.description,
      });
    } finally {
      setIsDownloading(false);
    }
  }, [selectedIds, photos]);

  const handleZipDownload = useCallback(async () => {
    if (selectedIds.size === 0 || !eventId) return;

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
  const hasPhotos = photos && photos.length > 0;

  return (
    <div className="flex flex-1 min-h-0 flex-col pb-14">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4">
        <h1 className="text-lg font-semibold">{th.photos.title}</h1>
        {hasPhotos && (
          <Button
            variant="ghost"
            size="sm"
            onClick={selectedIds.size === photos.length ? clearSelection : selectAll}
          >
            {selectedIds.size === photos.length ? th.photos.clearSelection : th.photos.selectAll}
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-1 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : hasPhotos ? (
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
                  {isSelected && (
                    <div className="absolute inset-0 z-5 bg-black/30" />
                  )}
                  {isSelected && (
                    <div className="absolute right-2 top-2 z-10 rounded-full bg-primary p-1.5">
                      <Check className="size-4 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia>
                  <Images className="size-8 text-muted-foreground" />
                </EmptyMedia>
                <EmptyTitle>{th.photos.empty}</EmptyTitle>
                <EmptyDescription>{th.photos.emptyDescription}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        )}
      </div>

      {/* Download bar — only when photos are selected */}
      {selectedIds.size > 0 && (
        <div className="border-t bg-background px-4 py-3">
          <Button
            className="w-full"
            onClick={shareSupported ? handleShareSelected : handleZipDownload}
            disabled={isPending}
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
        </div>
      )}

      <BottomNav eventId={eventId!} />
    </div>
  );
}
