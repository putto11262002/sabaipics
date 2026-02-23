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
  Lock,
  Unlock,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Calendar,
  Image,
  Loader2,
  ExternalLink,
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
import { useUser } from '../../hooks/users/use-user';
import { useUserCredits, type CreditLedgerEntry } from '../../hooks/users/use-user-credits';
import { useLockUser } from '../../hooks/users/use-lock-user';
import { useUnlockUser } from '../../hooks/users/use-unlock-user';

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

function getStatusBadge(user: { bannedAt: string | null; deletedAt: string | null }) {
  if (user.deletedAt) return <Badge variant="secondary">Deleted</Badge>;
  if (user.bannedAt) return <Badge variant="warning">Suspended</Badge>;
  return <Badge variant="success">Active</Badge>;
}

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  gift: 'Gift',
  discount: 'Discount',
  upload: 'Upload',
  refund: 'Refund',
  admin_adjustment: 'Admin',
  apple_purchase: 'Apple',
};

// =============================================================================
// Credit History Columns
// =============================================================================

const columnHelper = createColumnHelper<CreditLedgerEntry>();

const creditColumns = [
  columnHelper.accessor('createdAt', {
    header: 'Date',
    cell: (info) =>
      new Date(info.getValue()).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
  }),
  columnHelper.accessor('type', {
    header: 'Type',
    cell: (info) => (
      <Badge variant={info.getValue() === 'credit' ? 'success' : 'destructive'}>
        {info.getValue()}
      </Badge>
    ),
  }),
  columnHelper.accessor('amount', {
    header: 'Amount',
    cell: (info) => {
      const amount = info.getValue();
      return (
        <span className={`font-medium tabular-nums ${amount > 0 ? 'text-success' : 'text-destructive'}`}>
          {amount > 0 ? '+' : ''}{amount.toLocaleString()}
        </span>
      );
    },
  }),
  columnHelper.accessor('source', {
    header: 'Source',
    cell: (info) => (
      <Badge variant="secondary">{SOURCE_LABELS[info.getValue()] ?? info.getValue()}</Badge>
    ),
  }),
  columnHelper.accessor('operationType', {
    header: 'Operation',
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() || '-'}</span>
    ),
  }),
];

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

function CreditHistoryTable({ entries }: { entries: CreditLedgerEntry[] }) {
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const table = useReactTable({
    data: entries,
    columns: creditColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <div className="space-y-4">
      <DataTable table={table} emptyMessage="No credit history" />
      {table.getPageCount() > 1 && (
        <DataTablePagination table={table} showSelectedCount={false} />
      )}
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

function UserDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data: userData, isLoading, error, refetch } = useUser(id!);
  const {
    data: creditsData,
    isLoading: creditsLoading,
    error: creditsError,
    refetch: refetchCredits,
  } = useUserCredits(id!);

  const lockUser = useLockUser();
  const unlockUser = useUnlockUser();

  const user = userData?.data.user;
  const stats = userData?.data.stats;
  const credits = creditsData?.data ?? [];

  const isBanned = !!user?.bannedAt;
  const isDeleted = !!user?.deletedAt;

  const handleLock = () => {
    lockUser.mutate(
      { id: id! },
      {
        onSuccess: () => toast.success('User suspended'),
        onError: (e) => toast.error('Failed to suspend user', { description: e.message }),
      },
    );
  };

  const handleUnlock = () => {
    unlockUser.mutate(
      { id: id! },
      {
        onSuccess: () => toast.success('User reactivated'),
        onError: (e) => toast.error('Failed to reactivate user', { description: e.message }),
      },
    );
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Users', href: '/users' },
          { label: user?.name || user?.email || 'User' },
        ]}
      >
        {user && !isDeleted && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant={isBanned ? 'default' : 'destructive'}
                size="sm"
                disabled={lockUser.isPending || unlockUser.isPending}
              >
                {lockUser.isPending || unlockUser.isPending ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : isBanned ? (
                  <Unlock className="mr-1 size-4" />
                ) : (
                  <Lock className="mr-1 size-4" />
                )}
                {isBanned ? 'Reactivate' : 'Suspend'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isBanned ? 'Reactivate user?' : 'Suspend user?'}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isBanned
                    ? `This will unlock ${user.name || user.email}'s account, allowing them to sign in and use the platform again.`
                    : `This will lock ${user.name || user.email}'s account. They will be signed out and unable to access the platform.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={isBanned ? handleUnlock : handleLock}>
                  {isBanned ? 'Reactivate' : 'Suspend'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
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
            <AlertTitle>Failed to load user</AlertTitle>
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

        {/* User info */}
        {user && (
          <>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{user.name || 'Unnamed'}</h2>
                {getStatusBadge(user)}
              </div>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Joined {formatDate(user.createdAt)}</span>
                {user.bannedAt && <span>Suspended {formatDate(user.bannedAt)}</span>}
                <a
                  href={`https://dashboard.clerk.com/last-active?path=users/${user.clerkId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Clerk <ExternalLink className="size-3" />
                </a>
                {user.stripeCustomerId && (
                  <a
                    href={`https://dashboard.stripe.com/customers/${user.stripeCustomerId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Stripe <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Stats cards */}
            {stats && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard title="Credit Balance" value={user.balance} icon={CreditCard} />
                <StatCard title="Total Purchased" value={stats.totalCredits} icon={TrendingUp} />
                <StatCard title="Total Used" value={Math.abs(stats.totalDebits)} icon={TrendingDown} />
                <StatCard title="Total Events" value={stats.totalEvents} icon={Calendar} />
                <StatCard title="Total Photos" value={stats.totalPhotos} icon={Image} />
              </div>
            )}

            {/* Credit history */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Credit History</h3>

              {creditsError && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Failed to load credit history</AlertTitle>
                  <AlertDescription>{creditsError.message}</AlertDescription>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-2"
                    onClick={() => refetchCredits()}
                  >
                    <RefreshCw className="mr-1 size-4" />
                    Retry
                  </Button>
                </Alert>
              )}

              {creditsLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 px-4 py-3">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                      <Skeleton className="h-4 w-12" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  ))}
                </div>
              )}

              {!creditsLoading && !creditsError && <CreditHistoryTable entries={credits} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export { UserDetailPage as Component };
