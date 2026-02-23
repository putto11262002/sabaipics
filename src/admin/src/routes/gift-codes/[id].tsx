import { useState } from 'react';
import { useParams } from 'react-router';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  AlertCircle,
  RefreshCw,
  Copy,
  Link,
  Power,
  PowerOff,
  Users,
  CreditCard,
  Hash,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { DataTable } from '@/dashboard/src/components/events-table/data-table';
import { DataTablePagination } from '@/dashboard/src/components/events-table/data-table-pagination';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useGiftCode } from '../../hooks/gift-codes/use-gift-code';
import {
  useGiftCodeRedemptions,
  type RedemptionItem,
} from '../../hooks/gift-codes/use-gift-code-redemptions';
import { useUpdateGiftCode } from '../../hooks/gift-codes/use-update-gift-code';

// =============================================================================
// Helpers
// =============================================================================

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(code: { active: boolean; expiresAt: string | null }) {
  const now = new Date();
  if (code.expiresAt && new Date(code.expiresAt) < now) {
    return <Badge variant="secondary">Expired</Badge>;
  }
  if (!code.active) {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

// =============================================================================
// Components
// =============================================================================

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Redemptions Table
// =============================================================================

const columnHelper = createColumnHelper<RedemptionItem>();

const redemptionColumns = [
  columnHelper.accessor('photographer.name', {
    header: 'Photographer',
    cell: (info) => (
      <span className="font-medium">{info.getValue() || 'Unnamed'}</span>
    ),
  }),
  columnHelper.accessor('photographer.email', {
    header: 'Email',
  }),
  columnHelper.accessor('creditsGranted', {
    header: 'Credits',
    cell: (info) => (
      <span className="font-medium tabular-nums text-success">
        +{info.getValue().toLocaleString()}
      </span>
    ),
  }),
  columnHelper.accessor('redeemedAt', {
    header: 'Redeemed',
    cell: (info) => formatDateTime(info.getValue()),
  }),
];

function RedemptionsTable({ entries }: { entries: RedemptionItem[] }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const table = useReactTable({
    data: entries,
    columns: redemptionColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-4">
      <DataTable table={table} emptyMessage="No redemptions yet" />
      {table.getPageCount() > 1 && (
        <DataTablePagination table={table} showSelectedCount={false} />
      )}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

function GiftCodeDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: codeData, isLoading, error, refetch } = useGiftCode(id!);
  const {
    data: redemptionsData,
    isLoading: redemptionsLoading,
    error: redemptionsError,
    refetch: refetchRedemptions,
  } = useGiftCodeRedemptions({ id: id! });

  const updateGiftCode = useUpdateGiftCode();

  const code = codeData?.data;
  const redemptions = redemptionsData?.data ?? [];

  const isActive = code?.active && !(code.expiresAt && new Date(code.expiresAt) < new Date());

  const handleCopyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code.code);
    toast.success('Code copied');
  };

  const handleCopyLink = () => {
    if (!code) return;
    const link = `${import.meta.env.VITE_DASHBOARD_URL}/credits?code=${code.code}`;
    navigator.clipboard.writeText(link);
    toast.success('Link copied');
  };

  const handleToggleActive = () => {
    if (!code) return;
    updateGiftCode.mutate(
      { id: id!, active: !code.active },
      {
        onSuccess: () =>
          toast.success(code.active ? 'Gift code deactivated' : 'Gift code activated'),
        onError: (e) =>
          toast.error('Failed to update gift code', { description: e.message }),
      },
    );
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Gift Codes', href: '/gift-codes' },
          { label: code?.code || 'Gift Code' },
        ]}
      >
        {code && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyCode}>
              <Copy className="mr-1 size-4" />
              Copy Code
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              <Link className="mr-1 size-4" />
              Copy Link
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant={code.active ? 'destructive' : 'default'}
                  size="sm"
                  disabled={updateGiftCode.isPending}
                >
                  {updateGiftCode.isPending ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : code.active ? (
                    <PowerOff className="mr-1 size-4" />
                  ) : (
                    <Power className="mr-1 size-4" />
                  )}
                  {code.active ? 'Deactivate' : 'Activate'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {code.active ? 'Deactivate gift code?' : 'Activate gift code?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {code.active
                      ? `This will prevent anyone from redeeming ${code.code}. Existing redemptions are not affected.`
                      : `This will allow photographers to redeem ${code.code} again.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleToggleActive}>
                    {code.active ? 'Deactivate' : 'Activate'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SidebarPageHeader>

      <div className="p-4 space-y-6">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-6">
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
                  <CardContent><Skeleton className="h-7 w-16" /></CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load gift code</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1 size-4" />
              Retry
            </Button>
          </Alert>
        )}

        {/* Code info */}
        {code && (
          <>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <code className="text-xl font-mono font-semibold">{code.code}</code>
                {getStatusBadge(code)}
              </div>
              {code.description && (
                <p className="text-sm text-muted-foreground">{code.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{code.credits.toLocaleString()} credits per redemption</span>
                <span>Created {formatDate(code.createdAt)} by {code.createdBy}</span>
                <span>Expires: {code.expiresAt ? formatDate(code.expiresAt) : 'Never'}</span>
                <span>Credit expiry: {code.creditExpiresInDays} days</span>
                <span>Max per user: {code.maxRedemptionsPerUser}</span>
                {code.maxRedemptions != null && (
                  <span>Max total: {code.maxRedemptions}</span>
                )}
              </div>
            </div>

            {/* Stats cards */}
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title="Total Redemptions"
                value={code.stats.totalRedemptions}
                icon={Hash}
              />
              <StatCard
                title="Total Credits Issued"
                value={code.stats.totalCreditsIssued}
                icon={CreditCard}
              />
              <StatCard
                title="Unique Users"
                value={code.stats.uniqueUsers}
                icon={Users}
              />
            </div>

            {/* Redemptions table */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Redemptions</h3>

              {redemptionsError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Failed to load redemptions</AlertTitle>
                  <AlertDescription>{redemptionsError.message}</AlertDescription>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-2"
                    onClick={() => refetchRedemptions()}
                  >
                    <RefreshCw className="mr-1 size-4" />
                    Retry
                  </Button>
                </Alert>
              )}

              {redemptionsLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ))}
                </div>
              )}

              {!redemptionsLoading && !redemptionsError && (
                <RedemptionsTable entries={redemptions} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export { GiftCodeDetailPage as Component };
