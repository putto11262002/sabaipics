import { useState, useCallback } from 'react';
import { Download, Check, RefreshCw, Image } from 'lucide-react';
import { RowsPhotoAlbum, type Photo } from 'react-photo-album';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Spinner } from '@/shared/components/ui/spinner';
import { type SearchResult } from '../lib/api';
import { th } from '../lib/i18n';
import { LineDeliveryButton } from './LineDeliveryButton';
import { useLineStatus } from '@/shared/hooks/rq/line/use-line-status';
import { useDownloadBulk } from '@/shared/hooks/rq/downloads/use-download-bulk';

const MAX_SELECTION = 15;

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
  searchResult: SearchResult;
  onSearchAgain: () => void;
}

export function ResultsStep({ eventId, searchId, photos, searchResult, onSearchAgain }: ResultsStepProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { data: lineStatus } = useLineStatus({ eventId });
  const { mutateAsync: downloadAsync, isPending: isDownloadPending } = useDownloadBulk();

  const albumPhotos: Photo[] = photos.map((photo) => ({
    src: photo.thumbnailUrl,
    width: 400,
    height: 400,
    key: photo.photoId,
  }));

  const toggleSelection = useCallback((photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        if (next.size >= MAX_SELECTION) {
          toast.warning(th.results.maxSelection.title(MAX_SELECTION), {
            description: th.results.maxSelection.description(MAX_SELECTION),
          });
          return prev;
        }
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const handlePhotoClick = useCallback(
    (index: number) => {
      const photo = photos[index];
      if (photo) {
        toggleSelection(photo.photoId);
      }
    },
    [photos, toggleSelection],
  );

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

  const lineAvailable = lineStatus?.available ?? true; // Default to true - fail open on network errors

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

      {/* Content */}
      <div className="flex-1 px-2 pb-4">
        {/* Photo Grid */}
        <RowsPhotoAlbum
          photos={albumPhotos}
          targetRowHeight={150}
          rowConstraints={{ minPhotos: 2, maxPhotos: 4 }}
          spacing={4}
          onClick={({ index }) => handlePhotoClick(index)}
          render={{
            extras: (_, { index }) => {
              const photoData = photos[index];
              const isSelected = photoData && selectedIds.has(photoData.photoId);
              return (
                <>
                  {/* Dark overlay when selected */}
                  {isSelected && (
                    <div className="absolute inset-0 z-5 rounded bg-black/30" />
                  )}
                  {/* Selection indicator - top right */}
                  {isSelected && (
                    <div className="absolute right-2 top-2 z-10 rounded-full bg-primary p-1.5">
                      <Check className="size-4 text-primary-foreground" strokeWidth={3} />
                    </div>
                  )}
                </>
              );
            },
            image: (props) => <img {...props} className="cursor-pointer rounded transition-all" />,
            wrapper: ({ children }) => <div className="group relative">{children}</div>,
          }}
        />
      </div>

      {/* Floating Action Buttons - only show when photos selected */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 right-4 z-30 flex flex-col gap-3 opacity-100 md:right-6 md:flex-row">
          {lineAvailable && (
            <LineDeliveryButton
              eventId={eventId}
              searchId={searchId}
              searchResult={searchResult}
              selectedIds={selectedIds}
            />
          )}
          <Button
            variant="default"
            size="icon"
            className="size-12 rounded-full shadow-lg"
            onClick={handleDownloadSelected}
            disabled={isDownloadPending}
          >
            {isDownloadPending ? (
              <Spinner className="size-5" />
            ) : (
              <Download className="size-5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
