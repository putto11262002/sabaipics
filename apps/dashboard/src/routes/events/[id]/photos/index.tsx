import { useState, useCallback } from 'react';
import { useParams } from 'react-router';
import { Button } from '@sabaipics/ui/components/button';
import { Download, Trash2, CheckSquare } from 'lucide-react';
import { PhotosGridView } from '../../../../components/photos/PhotosGridView';
import { SimplePhotoLightbox } from '../../../../components/photos/SimplePhotoLightbox';
import { usePhotos } from '../../../../hooks/photos/usePhotos';
import { useDeletePhotos } from '../../../../hooks/photos/useDeletePhotos';
import { toast } from 'sonner';

const MAX_SELECTION = 15;

export default function EventPhotosTab() {
  const { id } = useParams<{ id: string }>();

  // View state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Fetch photos for the event (only indexed photos)
  const photosQuery = usePhotos({ eventId: id, status: ['indexed'] });

  // Delete mutation
  const deleteMutation = useDeletePhotos();

  const handleSelectionChange = useCallback((photoIds: string[]) => {
    setSelectedPhotoIds(photoIds);
  }, []);

  const handleBulkDownload = useCallback(async () => {
    if (selectedPhotoIds.length === 0) return;

    setIsDownloading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/events/${id}/photos/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ photoIds: selectedPhotoIds }),
      });

      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      // Get the zip blob from the response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}-photos.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Downloaded ${selectedPhotoIds.length} photos`);

      // Clear selection after successful download
      setSelectedPhotoIds([]);
      setIsSelectionMode(false);
    } catch (error) {
      console.error('Failed to download photos:', error);
      toast.error('Failed to download photos. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [selectedPhotoIds, id]);

  const handleBulkDelete = useCallback(() => {
    if (selectedPhotoIds.length === 0 || !id) return;

    deleteMutation.mutate(
      { eventId: id, photoIds: selectedPhotoIds },
      {
        onSuccess: (data) => {
          toast.success(`Deleted ${data.data.deletedCount} photos`);
          setSelectedPhotoIds([]);
          setIsSelectionMode(false);
        },
        onError: (error) => {
          console.error('Failed to delete photos:', error);
          toast.error('Failed to delete photos. Please try again.');
        },
      },
    );
  }, [selectedPhotoIds, id, deleteMutation]);

  const handleExitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
  }, []);

  const handlePhotoClick = useCallback((index: number) => {
    setSelectedPhotoIndex(index);
    setIsLightboxOpen(true);
  }, []);

  const handleCloseLightbox = useCallback(() => {
    setIsLightboxOpen(false);
  }, []);

  // Get all photos from all pages
  const allPhotos = photosQuery.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-4">
      {/* Bulk Action / Selection Mode */}
      <div className="flex justify-between items-center">
        {selectedPhotoIds.length > 0 ? (
          /* Bulk action bar */
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {selectedPhotoIds.length} selected
              {selectedPhotoIds.length >= MAX_SELECTION && ` (max ${MAX_SELECTION})`}
            </span>
            <Button size="sm" variant="outline" onClick={handleExitSelectionMode}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleBulkDownload} disabled={isDownloading || deleteMutation.isPending}>
              <Download className="size-4 mr-2" />
              {isDownloading ? 'Downloading...' : 'Download'}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={isDownloading || deleteMutation.isPending}>
              <Trash2 className="size-4 mr-2" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        ) : isSelectionMode ? (
          /* Selection mode active - show cancel button */
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Selection mode</span>
            <Button size="sm" variant="ghost" onClick={handleExitSelectionMode}>
              Cancel
            </Button>
          </div>
        ) : (
          /* Default state - selection mode button only */
          <Button size="sm" variant="outline" onClick={() => setIsSelectionMode(true)}>
            <CheckSquare className="size-4 mr-2" />
            Select
          </Button>
        )}
      </div>

      {/* Grid View */}
      <div className="min-h-[500px]">
        <PhotosGridView
          key={isSelectionMode ? 'selection' : 'normal'}
          photos={allPhotos}
          isLoading={photosQuery.isLoading}
          onPhotoClick={handlePhotoClick}
          onSelectionChange={handleSelectionChange}
          isSelectionMode={isSelectionMode}
          hasNextPage={photosQuery.hasNextPage}
          onLoadMore={() => photosQuery.fetchNextPage()}
          isFetchingNextPage={photosQuery.isFetchingNextPage}
        />
      </div>

      {/* Loading indicator at bottom */}
      {photosQuery.isFetchingNextPage && (
        <div className="flex justify-center pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Loading more photos...
          </div>
        </div>
      )}

      {/* Lightbox */}
      <SimplePhotoLightbox
        photos={allPhotos}
        index={selectedPhotoIndex}
        open={isLightboxOpen}
        onClose={handleCloseLightbox}
      />
    </div>
  );
}
