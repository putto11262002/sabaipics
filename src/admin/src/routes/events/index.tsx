import { useState, useDeferredValue, useMemo } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  createColumnHelper,
} from '@tanstack/react-table';
import type { PaginationState } from '@tanstack/react-table';
import {
  AlertCircle,
  RefreshCw,
  Calendar,
  Search,
  Loader2,
  Image,
  HardDrive,
  Clock,
  Trash2,
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
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { DataTable } from '@/dashboard/src/components/events-table/data-table';
import { DataTablePagination } from '@/dashboard/src/components/events-table/data-table-pagination';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useAdminEvents, type AdminEventListItem } from '../../hooks/events/use-admin-events';
import { useAdminEventStats } from '../../hooks/events/use-admin-event-stats';
import { useEmptyTrash } from '../../hooks/events/use-empty-trash';

// =============================================================================
// Helpers
// =============================================================================

type StatusFilter = 'active' | 'expired' | 'trashed';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'trashed', label: 'Trashed' },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusBadge(event: AdminEventListItem) {
  if (event.deletedAt) {
    return <Badge variant="destructive">Trashed</Badge>;
  }
  const now = new Date();
  if (new Date(event.expiresAt) <= now) {
    return <Badge variant="secondary">Expired</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

// =============================================================================
// Columns
// =============================================================================

const columnHelper = createColumnHelper<AdminEventListItem>();

const columns = [
  columnHelper.accessor('name', {
    header: 'Event Name',
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor('photographer', {
    header: 'Photographer',
    cell: (info) => {
      const photographer = info.getValue();
      return (
        <div className="text-sm">
          <Link
            to={`/users/${photographer.id}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {photographer.name || 'Unnamed'}
          </Link>
          <div className="text-muted-foreground">{photographer.email}</div>
        </div>
      );
    },
  }),
  columnHelper.accessor('photoCount', {
    header: 'Photos',
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
  }),
  columnHelper.accessor('storageBytes', {
    header: 'Storage',
    cell: (info) => <span className="tabular-nums">{formatBytes(info.getValue())}</span>,
  }),
  columnHelper.accessor('faceCount', {
    header: 'Faces',
    cell: (info) => <span className="tabular-nums">{info.getValue().toLocaleString()}</span>,
  }),
  columnHelper.display({
    id: 'status',
    header: 'Status',
    cell: ({ row }) => getStatusBadge(row.original),
  }),
  columnHelper.accessor('createdAt', {
    header: 'Created',
    cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
  }),
  columnHelper.accessor('expiresAt', {
    header: 'Expires',
    cell: (info) => <span className="text-muted-foreground">{formatDate(info.getValue())}</span>,
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

function StatsCards() {
  const { data, isLoading } = useAdminEventStats();
  const stats = data?.data;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
            <CardContent><Skeleton className="h-7 w-16" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <StatCard title="Active Events" value={stats.totalActive} icon={Calendar} />
      <StatCard title="Expired Events" value={stats.totalExpired} icon={Clock} />
      <StatCard title="Trashed Events" value={stats.totalTrashed} icon={Trash2} />
      <StatCard title="Total Photos" value={stats.totalPhotos} icon={Image} />
      <StatCard title="Total Storage" value={formatBytes(stats.totalStorageBytes)} icon={HardDrive} />
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

function EventsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useAdminEvents({
    search: deferredSearch || undefined,
    status,
    limit: 250,
  });

  const emptyTrash = useEmptyTrash();

  const events = useMemo(() => data?.data ?? [], [data?.data]);

  const table = useReactTable({
    data: events,
    columns,
    state: { pagination },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const handleEmptyTrash = () => {
    emptyTrash.mutate(undefined, {
      onSuccess: (data) => {
        const count = data.data.deletedCount;
        toast.success(
          count > 0
            ? `Permanently deleted ${count} event${count === 1 ? '' : 's'}`
            : 'No events eligible for permanent deletion',
        );
      },
      onError: (e) => toast.error('Failed to empty trash', { description: e.message }),
    });
  };

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Events' }]}>
        {status === 'trashed' && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={emptyTrash.isPending}>
                {emptyTrash.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                <Trash2 className="mr-1 size-4" />
                Empty Trash
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Empty trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all trashed events older than 30 days,
                  including all photos, face data, and storage. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleEmptyTrash}>
                  Delete permanently
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </SidebarPageHeader>

      <div className="p-4 space-y-4">
        {/* Stats cards */}
        <StatsCards />

        {/* Search + Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by event, photographer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((prev) => ({ ...prev, pageIndex: 0 }));
              }}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                variant={status === tab.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setStatus(tab.value);
                  setPagination((prev) => ({ ...prev, pageIndex: 0 }));
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load events</AlertTitle>
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

        {/* Empty state */}
        {!isLoading && !error && events.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {deferredSearch ? 'No events match your search' : `No ${status} events`}
            </p>
            {deferredSearch && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setSearch('')}
              >
                Clear search
              </Button>
            )}
          </div>
        )}

        {/* Table + Pagination */}
        {(isLoading || events.length > 0) && (
          <div className="space-y-4">
            <DataTable
              table={table}
              emptyMessage="No events found"
              onRowClick={(event) => navigate(`/events/${event.id}`)}
            />
            <DataTablePagination table={table} showSelectedCount={false} />
          </div>
        )}
      </div>
    </>
  );
}

export { EventsPage as Component };
