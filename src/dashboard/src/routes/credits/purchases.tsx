import { useState } from 'react';
import { useReactTable, getCoreRowModel, createColumnHelper } from '@tanstack/react-table';
import { Badge } from '@/shared/components/ui/badge';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from '@/shared/components/ui/card';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { ExternalLink, Wallet, Clock, TrendingDown, RefreshCw } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { CardAction } from '@/shared/components/ui/card';
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

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary, isRefetching: summaryRefetching } = useCreditHistory(0, 1);
  const summary = summaryData?.data?.summary;

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
      const next = typeof updater === 'function' ? updater({ pageIndex: page, pageSize }) : updater;
      setPage(next.pageIndex);
      setPageSize(next.pageSize);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="ml-auto h-4 w-12" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="py-4">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Wallet />
            </EmptyMedia>
            <EmptyTitle>No purchases yet</EmptyTitle>
            <EmptyDescription>Buy credits to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      {/* Summary Cards */}
      <div className="grid auto-rows-min gap-4 md:grid-cols-3">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Balance</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.balance ?? 0).toLocaleString()
              )}
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => refetchSummary()}
                disabled={summaryRefetching}
              >
                <RefreshCw className={summaryRefetching ? 'animate-spin' : ''} />
              </Button>
            </CardAction>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <Wallet className="mr-1 size-4" />
            Available credits
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Expiring Soon</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.expiringSoon ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter
            className={`text-sm ${(summary?.expiringSoon ?? 0) > 0 ? 'text-warning' : 'text-muted-foreground'}`}
          >
            <Clock className="mr-1 size-4" />
            Credits expiring in 30 days
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Used This Month</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {summaryLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (summary?.usedThisMonth ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-destructive">
            <TrendingDown className="mr-1 size-4" />
            Credits used this month
          </CardFooter>
        </Card>
      </div>

      <DataTable table={table} />
      {(pagination?.totalPages ?? 0) > 1 && (
        <DataTablePagination table={table} showSelectedCount={false} />
      )}
    </div>
  );
}
