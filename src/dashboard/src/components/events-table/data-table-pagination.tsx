import type { Table as TanstackTable } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/ui/components/ui/select';

interface DataTablePaginationProps<TData> {
  table: TanstackTable<TData>;
  /** Show selected row count */
  showSelectedCount?: boolean;
  /** Show rows per page selector */
  showPageSize?: boolean;
  /** Page size options */
  pageSizeOptions?: number[];
}

export function DataTablePagination<TData>({
  table,
  showSelectedCount = true,
  showPageSize = true,
  pageSizeOptions = [10, 20, 30, 40, 50],
}: DataTablePaginationProps<TData>) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between px-2">
      {/* Selected count - hidden on mobile */}
      {showSelectedCount && (
        <div className="text-muted-foreground text-sm hidden sm:block">
          {table.getFilteredSelectedRowModel().rows.length} of{' '}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
      )}

      {/* Pagination controls */}
      <div className="flex items-center justify-between sm:justify-end gap-4 sm:gap-6 lg:gap-8">
        {/* Rows per page - hidden on mobile */}
        {showPageSize && (
          <div className="hidden sm:flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Rows per page</p>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => {
                table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {pageSizeOptions.map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page indicator */}
        <div className="text-sm text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
        </div>

        {/* Prev/Next buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">Go to previous page</span>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">Go to next page</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
