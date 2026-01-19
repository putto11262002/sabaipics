import { AspectRatio } from '@sabaipics/ui/components/aspect-ratio';
import { Badge } from '@sabaipics/ui/components/badge';
import { Skeleton } from '@sabaipics/ui/components/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@sabaipics/ui/components/empty';
import { Check, Image as ImageIcon } from 'lucide-react';
import type { Photo } from '../../hooks/photos/usePhotos';
import { useState, useEffect, useRef } from 'react';
import { useReactTable, getCoreRowModel } from '@tanstack/react-table';
import { toast } from 'sonner';
import { ColumnsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/columns.css';

const MAX_SELECTION = 15;

interface PhotosGridViewProps {
  photos: Photo[];
  onPhotoSelected: (id: string) => void;
  selectedPhotoIds: string[];
  isSelelectable: boolean;
}

export function PhotosGridView({
  photos,
  onPhotoSelected,
  selectedPhotoIds,
  isSelelectable,
}: PhotosGridViewProps) {
  const [rowSelection, setRowSelection] = useState({});
  const previousPhotoIdsRef = useRef<string[]>([]);

  // // Loading state
  // if (isLoading) {
  //   return (
  //     <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
  //       {Array.from({ length: 8 }).map((_, i) => (
  //         <Skeleton key={i} className="aspect-square w-full" />
  //       ))}
  //     </div>
  //   );
  // }

  // Empty state
  if (photos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No photos uploaded yet</EmptyTitle>
          <EmptyDescription>
            Upload photos above to get started. Photos will appear here once processed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const dPhotos = photos
    ? photos?.map((photo, index) => ({
        src: photo.thumbnailUrl,
        height: photo.height,
        width: photo.width,
        key: photo.id,
      }))
    : [];
  return (
    <ColumnsPhotoAlbum
      photos={dPhotos}
      render={{
        container: ({ ref, ...rest }) => <div className="bg-muted" ref={ref} {...rest} />,
        extras: (_, { photo, index }) => {
          const isSelected = selectedPhotoIds.includes(photo.key);
          if (isSelected) {
            return (
              <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                <div className="bg-primary rounded-full p-2">
                  <Check className="size-6 text-primary-foreground" />
                </div>
              </div>
            );
          }
        },
      }}
    />
  );

  // Grid view with photos
  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {photos.map((photo, index) => {
          const row = table.getRow(String(index));
          const isSelected = row.getIsSelected();

          const handlePhotoClick = () => {
            if (isSelectionMode) {
              handleToggleRowSelection(String(index), !isSelected);
            } else {
              onPhotoClick(index);
            }
          };

          return (
            <div
              key={photo.id}
              className={`relative group cursor-pointer ${isSelected ? 'ring-2 ring-primary' : ''}`}
              onClick={handlePhotoClick}
            >
              {/* Selected overlay */}
              {isSelected && (
                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                  <div className="bg-primary rounded-full p-2">
                    <Check className="size-6 text-primary-foreground" />
                  </div>
                </div>
              )}

              {/* Photo display */}
              <div>
                <AspectRatio ratio={1} className="overflow-hidden">
                  <img
                    src={photo.thumbnailUrl}
                    alt=""
                    className={`object-cover w-full h-full transition-transform ${isSelectionMode ? '' : 'group-hover:scale-105'}`}
                    loading="lazy"
                    decoding="async"
                    fetchPriority={index < 4 ? 'high' : 'auto'}
                  />
                </AspectRatio>

                {/* Status and face count badges */}
                {!isSelectionMode && (
                  <>
                    {/* Status badge (for non-indexed photos) */}
                    {photo.status === 'uploading' && (
                      <Badge variant="secondary" className="absolute top-2 right-2">
                        Uploading
                      </Badge>
                    )}
                    {photo.status === 'indexing' && (
                      <Badge variant="secondary" className="absolute top-2 right-2">
                        Indexing
                      </Badge>
                    )}
                    {photo.status === 'failed' && (
                      <Badge variant="destructive" className="absolute top-2 right-2">
                        Failed
                      </Badge>
                    )}

                    {/* Face count badge (only for indexed photos on hover) */}
                    {photo.status === 'indexed' && (
                      <Badge className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {photo.faceCount} {photo.faceCount === 1 ? 'face' : 'faces'}
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
