import { useState, useCallback, useEffect } from 'react';
import { Download, Check, RefreshCw, Image, Info } from 'lucide-react';
import { RowsPhotoAlbum, type Photo } from 'react-photo-album';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Spinner } from '@/shared/components/ui/spinner';
import { downloadBulk, getLineStatus, type SearchResult } from '../lib/api';
import { th } from '../lib/i18n';
import { LineDeliveryButton } from './LineDeliveryButton';

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [lineAvailable, setLineAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    getLineStatus(eventId)
      .then((s) => setLineAvailable(s.available))
      .catch(() => setLineAvailable(true));
  }, [eventId]);

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

    setIsDownloading(true);
    try {
      const blob = await downloadBulk(eventId, Array.from(selectedIds));
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
    } finally {
      setIsDownloading(false);
    }
  }, [eventId, selectedIds]);

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
        <Alert variant="info">
          <Info />
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
                  {/* Selection indicator - top right */}
                  {isSelected && (
                    <div className="absolute right-2 top-2 z-10 rounded-full bg-primary/60 p-1.5">
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

      {/* Sticky Footer — always visible */}
      <div className="sticky bottom-0 z-30 space-y-2 border-t bg-background p-4">
        {lineAvailable && (
          <LineDeliveryButton
            eventId={eventId}
            searchId={searchId}
            searchResult={searchResult}
          />
        )}
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={handleDownloadSelected}
          disabled={isDownloading || selectedIds.size === 0}
        >
          {isDownloading ? (
            <>
              <Spinner className="mr-1 size-4" />
              {th.results.downloading}
            </>
          ) : (
            <>
              <Download className="mr-1 size-4" />
              {selectedIds.size > 0
                ? th.results.download(selectedIds.size)
                : th.results.download(0)}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
