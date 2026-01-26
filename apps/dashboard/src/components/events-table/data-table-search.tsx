import type { Table as TanstackTable } from '@tanstack/react-table';
import { Search } from 'lucide-react';

import { Input } from '@sabaipics/uiv3/components/input';

interface DataTableSearchProps<TData> {
  table: TanstackTable<TData>;
  /** Column to filter on */
  column?: string;
  /** Placeholder text */
  placeholder?: string;
}

export function DataTableSearch<TData>({
  table,
  column = 'name',
  placeholder = 'Search...',
}: DataTableSearchProps<TData>) {
  return (
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={(table.getColumn(column)?.getFilterValue() as string) ?? ''}
        onChange={(event) => table.getColumn(column)?.setFilterValue(event.target.value)}
        className="pl-10"
      />
    </div>
  );
}
