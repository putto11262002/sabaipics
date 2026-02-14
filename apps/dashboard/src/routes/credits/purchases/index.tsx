import { useMemo, useState } from 'react';
import { AlertCircle, RefreshCw, CreditCard } from 'lucide-react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { useCreditPurchases } from '../../../hooks/credits/useCreditPurchases';
import { DataTable, createPurchaseColumns } from '../../../components/credits-table';
import { Alert, AlertDescription, AlertTitle } from '@sabaipics/uiv3/components/alert';
import { Button } from '@sabaipics/uiv3/components/button';
import { Skeleton } from '@sabaipics/uiv3/components/skeleton';
import { Spinner } from '@sabaipics/uiv3/components/spinner';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@sabaipics/uiv3/components/empty';
import { CreditTopUpDialog } from '../../../components/credits/CreditTopUpDialog';

export function PurchasesPage() {
  const [page, setPage] = useState(0);
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const { data, isLoading, error, refetch, isRefetching } = useCreditPurchases(page, 20);

  const columns = useMemo(() => createPurchaseColumns(), []);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Credits', href: '/credits' },
          { label: 'Purchases' },
        ]}
      >
        <Button size="sm" onClick={() => setCreditDialogOpen(true)}>
          <CreditCard className="mr-1 size-4" />
          Buy Credits
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Loading State */}
        {isLoading && (
          <div className="rounded-lg border">
            {/* Header */}
            <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16 ml-auto" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            {/* Rows */}
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b last:border-0 px-4 py-3"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16 ml-auto" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-8" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error loading purchases</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? (
                  <Spinner className="mr-1 size-3" />
                ) : (
                  <RefreshCw className="mr-1 size-3" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {data?.data && (
          <>
            {data.data.entries.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <CreditCard className="size-12 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>No purchases yet</EmptyTitle>
                  <EmptyDescription>
                    Purchase credits to start uploading photos to your events
                  </EmptyDescription>
                </EmptyHeader>
                <div className="mt-4">
                  <Button onClick={() => setCreditDialogOpen(true)}>
                    <CreditCard className="mr-1 size-4" />
                    Buy Credits
                  </Button>
                </div>
              </Empty>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Purchase History</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isRefetching}
                    title="Refresh"
                  >
                    <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <DataTable
                  data={data.data.entries}
                  columns={columns}
                  emptyMessage="No purchases found."
                  pagination={data.data.pagination}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Credit Top-Up Dialog */}
      <CreditTopUpDialog
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
      />
    </>
  );
}
