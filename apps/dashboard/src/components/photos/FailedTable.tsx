import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
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
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@sabaipics/ui/components/empty";
import { AlertCircle, CheckCircle, Image as ImageIcon, RotateCw, Trash } from "lucide-react";
import type { UploadQueueItem } from "../../types/upload";

interface FailedTableProps {
  items: UploadQueueItem[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

// Format file size utility
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export function FailedTable({ items, onRetry, onRemove }: FailedTableProps) {
  // Filter only failed items
  const failedItems = items.filter((item) => item.status === "failed");

  // Column definitions
  const columns: ColumnDef<UploadQueueItem>[] = [
    {
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
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "preview",
      header: "Preview",
      cell: () => (
        <div className="size-12 rounded bg-muted flex items-center justify-center">
          <ImageIcon className="size-6 text-muted-foreground" />
        </div>
      ),
    },
    {
      accessorKey: "file.name",
      header: "Filename",
      cell: ({ row }) => <span className="font-medium">{row.original.file.name}</span>,
    },
    {
      accessorKey: "file.size",
      header: "Size",
      cell: ({ row }) => (
        <span className="text-muted-foreground">{formatFileSize(row.original.file.size)}</span>
      ),
    },
    {
      accessorKey: "error",
      header: "Error",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <AlertCircle className="size-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive">{row.original.error || "Upload failed"}</span>
        </div>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const canRetry =
          !row.original.errorStatus ||
          (row.original.errorStatus !== 402 && row.original.errorStatus !== 403);

        return (
          <div className="flex gap-2">
            {canRetry && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRetry(row.original.id)}
                title="Retry upload"
              >
                <RotateCw className="size-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onRemove(row.original.id)}
              title="Remove from list"
            >
              <Trash className="size-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  // Create table instance
  const table = useReactTable({
    data: failedItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Handle bulk retry
  const handleRetrySelected = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    selectedRows.forEach((row) => {
      const canRetry =
        !row.original.errorStatus ||
        (row.original.errorStatus !== 402 && row.original.errorStatus !== 403);
      if (canRetry) {
        onRetry(row.original.id);
      }
    });
    table.resetRowSelection();
  };

  // Handle bulk remove
  const handleRemoveSelected = () => {
    const selectedRows = table.getFilteredSelectedRowModel().rows;
    selectedRows.forEach((row) => {
      onRemove(row.original.id);
    });
    table.resetRowSelection();
  };

  // Empty state
  if (failedItems.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle className="size-12" />
          </EmptyMedia>
          <EmptyTitle>No failed uploads</EmptyTitle>
          <EmptyDescription>All uploads completed successfully!</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const selectedCount = table.getFilteredSelectedRowModel().rows.length;

  // Table with failed items
  return (
    <div className="space-y-4">
      {/* Bulk Actions Bar */}
      {selectedCount > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleRetrySelected}>
              <RotateCw className="size-4 mr-1" />
              Retry Selected
            </Button>
            <Button size="sm" variant="destructive" onClick={handleRemoveSelected}>
              <Trash className="size-4 mr-1" />
              Remove Selected
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
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
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
