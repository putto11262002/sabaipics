import { AspectRatio } from "@sabaipics/ui/components/aspect-ratio";
import { Badge } from "@sabaipics/ui/components/badge";
import { Checkbox } from "@sabaipics/ui/components/checkbox";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@sabaipics/ui/components/empty";
import { Check, Image as ImageIcon } from "lucide-react";
import type { Photo } from "../../hooks/photos/usePhotos";
import { useState, useEffect, useRef } from "react";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";
import { toast } from "sonner";

const MAX_SELECTION = 15;

interface PhotosGridViewProps {
  photos: Photo[];
  isLoading: boolean;
  onPhotoClick: (index: number) => void;
  onSelectionChange?: (photoIds: string[]) => void;
  isSelectionMode?: boolean;
}

export function PhotosGridView({
  photos,
  isLoading,
  onPhotoClick,
  onSelectionChange,
  isSelectionMode = false
}: PhotosGridViewProps) {
  const [rowSelection, setRowSelection] = useState({});
  const previousPhotoIdsRef = useRef<string[]>([]);

  const table = useReactTable({
    data: photos,
    columns: [],
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_, index) => String(index),
    enableMultiRowSelection: true,
  });

  // Notify parent of selection changes (only when actually changed)
  useEffect(() => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const photoIds = selectedRows.map((row) => photos[parseInt(row.id)].id);

    // Only notify if the actual photo IDs changed
    const prevIds = previousPhotoIdsRef.current;
    const hasChanged = photoIds.length !== prevIds.length ||
      photoIds.some((id, i) => prevIds[i] !== id);

    if (hasChanged) {
      previousPhotoIdsRef.current = photoIds;
      onSelectionChange?.(photoIds);
    }
  }, [rowSelection, photos, onSelectionChange]);

  const handleToggleRowSelection = (rowId: string, value: boolean) => {
    const row = table.getRow(rowId);
    const currentSelectionCount = table.getFilteredSelectedRowModel().rows.length;
    const isCurrentlySelected = row.getIsSelected();

    if (value && !isCurrentlySelected && currentSelectionCount >= MAX_SELECTION) {
      toast.error(`Maximum ${MAX_SELECTION} photos can be selected`);
      return;
    }
    row.toggleSelected(!!value);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    );
  }

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

              {/* Selection mode checkbox (visible in selection mode or on hover) */}
              {(isSelectionMode || (!isSelectionMode && isSelected)) && (
                <div
                  className={`absolute top-2 left-2 z-20 ${isSelected || isSelectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleRowSelection(String(index), !isSelected);
                  }}
                >
                  <Checkbox
                    checked={isSelected}
                    className="bg-background"
                    aria-label={`Select photo ${photo.id}`}
                  />
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
                  />
                </AspectRatio>

                {/* Face count badge overlay */}
                {!isSelectionMode && (photo.status === 'uploading' || photo.status === 'indexing') ? (
                  <Badge className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Skeleton className="h-4 w-12 inline-block align-middle" />
                  </Badge>
                ) : !isSelectionMode && photo.status === 'indexed' && (
                  <Badge className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {photo.faceCount} {photo.faceCount === 1 ? "face" : "faces"}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
