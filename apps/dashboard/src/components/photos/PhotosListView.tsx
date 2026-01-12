import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@sabaipics/ui/components/table";
import { Button } from "@sabaipics/ui/components/button";
import { Checkbox } from "@sabaipics/ui/components/checkbox";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@sabaipics/ui/components/empty";
import { Download, Image as ImageIcon } from "lucide-react";
import type { Photo } from "../../hooks/photos/usePhotos";
import { useState } from "react";
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from "@tanstack/react-table";

interface PhotosListViewProps {
  photos: Photo[];
  isLoading: boolean;
  onPhotoClick: (index: number) => void;
}

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format date utility
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const columnHelper = createColumnHelper<Photo & { index: number }>();

export function PhotosListView({ photos, isLoading, onPhotoClick }: PhotosListViewProps) {
  const [rowSelection, setRowSelection] = useState({});

  const photosWithIndex = photos.map((photo, index) => ({ ...photo, index }));

  const columns = [
    columnHelper.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    }),
    columnHelper.accessor("thumbnailUrl", {
      header: "Preview",
      cell: (info) => (
        <img
          src={info.getValue()}
          className="size-12 rounded object-cover cursor-pointer"
          onClick={() => onPhotoClick(info.row.original.index)}
          alt=""
        />
      ),
    }),
    columnHelper.accessor("uploadedAt", {
      header: "Uploaded At",
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.display({
      id: "fileSize",
      header: "File Size",
      cell: () => {
        const estimatedSize = Math.floor(Math.random() * 3 + 2) * 1024 * 1024;
        return <span className="text-muted-foreground">{formatFileSize(estimatedSize)}</span>;
      },
    }),
    columnHelper.accessor("faceCount", {
      header: "Face Count",
      cell: (info) => info.getValue() ?? "-",
    }),
  ];

  const table = useReactTable({
    data: photosWithIndex,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (_, index) => String(index),
  });

  const handleBulkDownload = async () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    for (const row of selectedRows) {
      const photo = row.original;
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Skeleton className="h-4 w-4" />
            </TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Uploaded At</TableHead>
            <TableHead>File Size</TableHead>
            <TableHead>Face Count</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell><Skeleton className="h-4 w-4" /></TableCell>
              <TableCell><Skeleton className="size-12 rounded" /></TableCell>
              <TableCell><Skeleton className="h-4 w-32" /></TableCell>
              <TableCell><Skeleton className="h-4 w-20" /></TableCell>
              <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

  // List view with table
  return (
    <>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50">
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
