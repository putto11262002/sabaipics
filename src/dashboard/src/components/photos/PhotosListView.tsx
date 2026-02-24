import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { Check, Image as ImageIcon } from 'lucide-react';
import type { Photo } from '../../hooks/photos/usePhotos';
import { useState, useEffect, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { toast } from 'sonner';

const MAX_SELECTION = 15;

interface PhotosListViewProps {
  photos: Photo[];
  isLoading: boolean;
  onPhotoClick: (index: number) => void;
  onSelectionChange?: (photoIds: string[]) => void;
  isSelectionMode?: boolean;
}

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format date utility
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const columnHelper = createColumnHelper<Photo & { index: number }>();

export function PhotosListView({
  photos,
  isLoading,
  onPhotoClick,
  onSelectionChange,
  isSelectionMode = false,
}: PhotosListViewProps) {
  const [rowSelection, setRowSelection] = useState({});
  const previousPhotoIdsRef = useRef<string[]>([]);

  const photosWithIndex = photos.map((photo, index) => ({ ...photo, index }));

  const columns = [
    columnHelper.display({
      id: 'select',
      header: ({ table }) =>
        isSelectionMode ? (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        ) : null,
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => handleToggleRowSelection(row.id, !!value)}
          aria-label="Select row"
        />
      ),
    }),
    columnHelper.accessor('thumbnailUrl', {
      header: 'Preview',
      cell: (info) => {
        const photo = info.row.original;
        const isSelected = info.row.getIsSelected();
        return (
          <div className="relative size-12">
            <img
              src={info.getValue()}
              className={`size-12 rounded object-cover ${isSelectionMode ? 'cursor-pointer' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
              onClick={() => {
                if (isSelectionMode) {
                  handleToggleRowSelection(info.row.id, !isSelected);
                } else {
                  onPhotoClick(photo.index);
                }
              }}
              alt=""
            />
            {isSelected && (
              <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center">
                <Check className="size-4 text-white" />
              </div>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('uploadedAt', {
      header: 'Uploaded At',
      cell: (info) => formatDate(info.getValue()),
    }),
    columnHelper.accessor('fileSize', {
      header: 'File Size',
      cell: (info) => {
        const fileSize = info.getValue();
        return (
          <span className="text-muted-foreground">{fileSize ? formatFileSize(fileSize) : '-'}</span>
        );
      },
    }),
    columnHelper.accessor('faceCount', {
      header: 'Face Count',
      cell: (info) => info.getValue() ?? '-',
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
    enableMultiRowSelection: true,
  });

  // Notify parent of selection changes (only when actually changed)
  useEffect(() => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    const photoIds = selectedRows.map((row) => row.original.id);

    // Only notify if the actual photo IDs changed
    const prevIds = previousPhotoIdsRef.current;
    const hasChanged =
      photoIds.length !== prevIds.length || photoIds.some((id, i) => prevIds[i] !== id);

    if (hasChanged) {
      previousPhotoIdsRef.current = photoIds;
      onSelectionChange?.(photoIds);
    }
  }, [rowSelection, photosWithIndex, onSelectionChange]);

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
              <TableCell>
                <Skeleton className="h-4 w-4" />
              </TableCell>
              <TableCell>
                <Skeleton className="size-12 rounded" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-32" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-16" />
              </TableCell>
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
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = row.getIsSelected();
            return (
              <TableRow
                key={row.id}
                className={`cursor-pointer hover:bg-muted/50 ${isSelected ? 'bg-muted/50' : ''}`}
                onClick={() => {
                  if (isSelectionMode) {
                    handleToggleRowSelection(row.id, !isSelected);
                  }
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </>
  );
}
