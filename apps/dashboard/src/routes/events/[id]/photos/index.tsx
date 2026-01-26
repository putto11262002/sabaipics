import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router';
import { Button } from '@sabaipics/uiv3/components/button';
import { Download, Trash2, CheckSquare } from 'lucide-react';
import { PhotosGridView } from '../../../../components/photos/PhotosGridView';
import { usePhotos } from '../../../../hooks/photos/usePhotos';
import { useDeletePhotos } from '../../../../hooks/photos/useDeletePhotos';
import { useDownloadPhotos } from '../../../../hooks/photos/useDownloadPhotos';
import { toast } from 'sonner';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import { Skeleton } from '@sabaipics/uiv3/components/skeleton';

const MAX_SELECTION = 15;

// Skeleton component for photo grid loading state
function PhotosGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {Array.from({ length: 20 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}

export default function EventPhotosTab() {
  const { id } = useParams<{ id: string }>();

  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Fetch photos for the event (only indexed photos)
  const photosQuery = usePhotos({ eventId: id, status: ['indexed'] });

  // Delete mutation
  const deleteMutation = useDeletePhotos();

  // Download mutation
  const downloadMutation = useDownloadPhotos();

  const handleBulkDownload = useCallback(() => {
    if (selectedPhotoIds.length === 0 || !id) return;

    downloadMutation.mutate(
      { eventId: id, photoIds: selectedPhotoIds },
      {
        onSuccess: () => {
          toast.success(`Downloaded ${selectedPhotoIds.length} photos`);
          setSelectedPhotoIds([]);
          setIsSelectionMode(false);
        },
        onError: (error) => {
          console.error('Failed to download photos:', error);
          toast.error('Failed to download photos. Please try again.');
        },
      },
    );
  }, [selectedPhotoIds, id, downloadMutation]);

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

  const handlePhotoSelected = (id: string) => {
    if (selectedPhotoIds.includes(id)) {
      setSelectedPhotoIds((prev) => prev.filter((i) => i !== id));
      return;
    }
    if (selectedPhotoIds.length === MAX_SELECTION) {
      toast.error('Maximum selection reached');
      return;
    }
    setSelectedPhotoIds((prev) => [...prev, id]);
  };

  // Get all photos from all pages
  const allPhotos = photosQuery.data?.pages.flatMap((page) => page.data) ?? [];

  // Show skeleton on initial load
  const isInitialLoading = photosQuery.isLoading && !allPhotos.length;

  // Infinite scroll with Intersection Observer
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // When sentinel is visible and we have more pages, fetch next
        if (
          entries[0].isIntersecting &&
          photosQuery.hasNextPage &&
          !photosQuery.isFetchingNextPage
        ) {
          photosQuery.fetchNextPage();
        }
      },
      { rootMargin: '200px' }, // Trigger 200px before reaching bottom
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [photosQuery.hasNextPage, photosQuery.isFetchingNextPage, photosQuery.fetchNextPage]);

  return (
    <div className="py-4">
      {/* Bulk Action / Selection Mode */}
      <div className="flex justify-between items-center gap-3 sticky top-0 z-20 bg-background pb-4">
        {isSelectionMode ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {selectedPhotoIds.length} selected
            </span>
            <Button size="sm" variant="ghost" onClick={handleExitSelectionMode}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setIsSelectionMode(true)}>
            <CheckSquare className="size-4 mr-1" />
            Select
          </Button>
        )}
        <div className="flex items-center gap-3">
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkDownload}
              disabled={
                selectedPhotoIds.length === 0 ||
                downloadMutation.isPending ||
                deleteMutation.isPending
              }
            >
              <Download className="size-4 mr-1" />
              {downloadMutation.isPending ? 'Downloading...' : 'Download'}
            </Button>
            <Button
              size="sm"
              variant="destructiveOutline"
              onClick={handleBulkDelete}
              disabled={
                selectedPhotoIds.length === 0 ||
                downloadMutation.isPending ||
                deleteMutation.isPending
              }
            >
              <Trash2 className="size-4 mr-1" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </>
        </div>
      </div>

      {/* Grid View */}
      <div className="h-full mb-2">
        {isInitialLoading ? (
          <PhotosGridSkeleton />
        ) : (
          <PhotosGridView
            photos={allPhotos}
            onPhotoSelected={handlePhotoSelected}
            isSelelectable={isSelectionMode}
            selectedPhotoIds={selectedPhotoIds}
          />
        )}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={loadMoreRef} className="h-1" />

      {/* Loading indicator */}
      {photosQuery.isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}
    </div>
  );
}
