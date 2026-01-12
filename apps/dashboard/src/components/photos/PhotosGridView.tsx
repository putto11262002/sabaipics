import { AspectRatio } from "@sabaipics/ui/components/aspect-ratio";
import { Badge } from "@sabaipics/ui/components/badge";
import { Button } from "@sabaipics/ui/components/button";
import { Checkbox } from "@sabaipics/ui/components/checkbox";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@sabaipics/ui/components/empty";
import { Download, Image as ImageIcon } from "lucide-react";
import type { Photo } from "../../hooks/photos/usePhotos";
import { useState } from "react";
import { useReactTable, getCoreRowModel } from "@tanstack/react-table";

interface PhotosGridViewProps {
  photos: Photo[];
  isLoading: boolean;
  onPhotoClick: (index: number) => void;
}

export function PhotosGridView({ photos, isLoading, onPhotoClick }: PhotosGridViewProps) {
  const [rowSelection, setRowSelection] = useState({});

  const table = useReactTable({
    data: photos,
    columns: [],
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_, index) => String(index),
  });

  const handleBulkDownload = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    for (const row of selectedRows) {
      const photo = photos[parseInt(row.id)];
      try {
        const response = await fetch(photo.downloadUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `photo-${photo.id}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Failed to download photo:", error);
      }
    }
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {photos.map((photo, index) => (
          <div key={photo.id} className="relative group">
            {/* Checkbox overlay */}
            <Checkbox
              checked={table.getRow(String(index)).getIsSelected()}
              onCheckedChange={(value) =>
                table.getRow(String(index)).toggleSelected(!!value)
              }
              className="absolute top-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={`Select photo ${photo.id}`}
            />

            {/* Photo display */}
            <div
              className="cursor-pointer"
              onClick={() => onPhotoClick(index)}
            >
              <AspectRatio ratio={1} className="overflow-hidden">
                <img
                  src={photo.thumbnailUrl}
                  alt=""
                  className="object-cover w-full h-full transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              </AspectRatio>

              {/* Face count badge overlay */}
              {photo.faceCount !== null && (
                <Badge className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {photo.faceCount} {photo.faceCount === 1 ? "face" : "faces"}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bulk action bar */}
      {table.getFilteredSelectedRowModel().rows.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-4 z-50">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium">
              {table.getFilteredSelectedRowModel().rows.length} selected
            </span>
            <Button size="sm" onClick={handleBulkDownload}>
              <Download className="size-4 mr-2" />
              Download Selected
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
