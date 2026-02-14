import { useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  createColumnHelper,
} from '@tanstack/react-table';
import { Badge } from '@sabaipics/uiv3/components/badge';
import { Skeleton } from '@sabaipics/uiv3/components/skeleton';
import { ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { DataTable } from '../../components/events-table/data-table';
import { DataTablePagination } from '../../components/events-table/data-table-pagination';
import { useCreditHistory, type CreditEntry } from '../../hooks/credits/useCreditHistory';

const columnHelper = createColumnHelper<CreditEntry>();

const columns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) => format(parseISO(info.getValue()), 'MMM d, yyyy'),
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    cell: (info) => {
      const source = info.getValue();
      const labels: Record<string, string> = {
        purchase: 'Purchase',
        gift: 'Gift',
        discount: 'Discount',
        refund: 'Refund',
        admin_adjustment: 'Admin',
        apple_purchase: 'Apple',
      };
      return <Badge variant="secondary">{labels[source] ?? source}</Badge>;
    },
  }),
  columnHelper.accessor('amount', {
    header: 'Amount',
    cell: (info) => (
      <span className="font-medium tabular-nums text-success">
        +{info.getValue().toLocaleString()}
      </span>
    ),
  }),
  columnHelper.accessor('promoCode', {
    header: 'Promo Code',
    cell: (info) => info.getValue() ?? '-',
  }),
  columnHelper.accessor('stripeReceiptUrl', {
    header: 'Receipt',
    cell: (info) => {
      const url = info.getValue();
      if (!url) return '-';
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          View <ExternalLink className="size-3" />
        </a>
      );
    },
  }),
  columnHelper.accessor('expiresAt', {
    header: 'Expires',
    cell: (info) => format(parseISO(info.getValue()), 'MMM d, yyyy'),
  }),
];

export default function CreditPurchasesTab() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useCreditHistory(page, pageSize, 'credit');

  const entries = data?.data?.entries ?? [];
  const pagination = data?.data?.pagination;

  const table = useReactTable({
    data: entries,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: pagination?.totalPages ?? 0,
    state: {
      pagination: { pageIndex: page, pageSize },
    },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function'
        ? updater({ pageIndex: page, pageSize })
        : updater;
      setPage(next.pageIndex);
      setPageSize(next.pageSize);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <DataTable
        table={table}
        emptyMessage="No purchases yet. Buy credits to get started."
      />
      {(pagination?.totalPages ?? 0) > 1 && (
        <DataTablePagination table={table} showSelectedCount={false} />
      )}
    </div>
  );
}
