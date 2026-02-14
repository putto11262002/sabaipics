import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@sabaipics/uiv3/components/empty';
import { Check, Image as ImageIcon } from 'lucide-react';
import type { Photo } from '../../hooks/photos/usePhotos';
import { useState, useMemo } from 'react';

import { PhotoViewerSheet } from './PhotoViewerSheet';

import { RowsPhotoAlbum } from 'react-photo-album';
import 'react-photo-album/rows.css';

interface PhotosGridViewProps {
  photos: Photo[];
  onPhotoSelected: (id: string) => void;
  selectedPhotoIds: string[];
  isSelelectable: boolean;
}

export function PhotosGridView({
  photos: _photos,
  onPhotoSelected,
  selectedPhotoIds,
  isSelelectable,
}: PhotosGridViewProps) {
  const [index, setIndex] = useState(-1);

  const albumPhotos = useMemo(
    () =>
      _photos.map((photo) => ({
        src: photo.thumbnailUrl,
        height: photo.height ?? 1,
        width: photo.width ?? 1,
        key: photo.id,
      })),
    [_photos],
  );

  const viewerPhotos = useMemo(
    () =>
      _photos.map((photo) => ({
        id: photo.id,
        previewUrl: photo.previewUrl,
        width: photo.width ?? 1,
        height: photo.height ?? 1,
        uploadedAt: photo.uploadedAt,
        fileSize: photo.fileSize,
        faceCount: photo.faceCount,
      })),
    [_photos],
  );

  // Empty state
  if (albumPhotos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ImageIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle>No photos uploaded yet</EmptyTitle>
          <EmptyDescription>
            Upload photos above to get started. Photos will appear here once processed.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <PhotoViewerSheet
        photos={viewerPhotos}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(-1)}
      />
      <RowsPhotoAlbum
        photos={albumPhotos}
        onClick={(event) => {
          if (!isSelelectable) {
            setIndex(event.index);
            return;
          }

          if (!event.photo.key) {
            return;
          }

          onPhotoSelected(event.photo.key);
        }}
        render={{
          container: (props) => {
            const { ref, ...rest } = props;
            return <div className="bg-muted" ref={ref} {...rest} />;
          },
          extras: (_unused, context) => {
            if (!context.photo.key) {
              return null;
            }

            const isSelected = selectedPhotoIds.includes(context.photo.key);
            if (isSelected) {
              return (
                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                  <div className="bg-muted rounded-md border border-2 p-2">
                    <Check className="size-4 text-foreground" />
                  </div>
                </div>
              );
            }

            return null;
          },
        }}
      />
    </>
  );
}
