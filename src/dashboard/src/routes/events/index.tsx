import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';
import { Button } from '@/shared/components/ui/button';
import { Alert } from '@/shared/components/ui/alert';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { Calendar, Plus, Search } from 'lucide-react';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useEvents } from '../../hooks/events/useEvents';
import { CreateEventModal } from '../../components/events/CreateEventModal';
import { DeleteConfirmDialog } from '../../components/events/DeleteConfirmDialog';
import { useCopyToClipboard } from '../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../hooks/events/useDownloadQR';
import { useDeleteEvent } from '../../hooks/events/useDeleteEvent';
import {
  DataTable,
  DataTableSearch,
  DataTablePagination,
  useEventsTable,
  createColumns,
} from '../../components/events-table';
import type { EventTableActions } from '../../components/events-table';

type StatusFilter = 'all' | 'active' | 'expiring' | 'expired';

export default function EventsPage() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [deleteEventId, setDeleteEventId] = useState<string | null>(null);
  // Fetch larger dataset - table handles its own client-side pagination
  const { data, isLoading, error, refetch } = useEvents(0, 100);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const deleteEvent = useDeleteEvent();

  const handleCopyLink = (eventId: string) => {
    const searchUrl = `${window.location.origin}/participant/events/${eventId}/search`;
    copyToClipboard(searchUrl);
  };

  // Filter events by status
  const filteredEvents = useMemo(() => {
    if (!data?.data) return [];

    let filtered = data.data;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((event) => {
        const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
        const isExpired = daysUntilExpiry <= 0;
        const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;
        const isActive = daysUntilExpiry > 7;

        if (statusFilter === 'expired') return isExpired;
        if (statusFilter === 'expiring') return isExpiringSoon;
        if (statusFilter === 'active') return isActive;
        return true;
      });
    }

    return filtered;
  }, [data?.data, statusFilter]);

  // Handle soft delete confirmation
  const handleSoftDeleteConfirm = () => {
    if (!deleteEventId) return;

    deleteEvent.mutate(
      { eventId: deleteEventId },
      {
        onSuccess: () => {
          toast.success('Event deleted');
          setDeleteEventId(null);
        },
        onError: (error) => {
          toast.error('Delete failed', {
            description: error.message,
          });
          setDeleteEventId(null);
        },
      }
    );
  };

  // Create action handlers for the table
  const tableActions: EventTableActions = {
    onViewEvent: (eventId: string) => navigate(`/events/${eventId}`),
    onCopySearchLink: (eventId: string) => handleCopyLink(eventId),
    onDownloadQR: (eventId: string, eventName: string) =>
      downloadQR.mutate(
        { eventId, eventName },
        { onError: (e) => toast.error('Failed to download QR', { description: e.message }) },
      ),
    onDeleteEvent: (eventId: string) => {
      setDeleteEventId(eventId); // Open soft delete dialog
    },
    isCopied,
  };

  // Create columns with action handlers
  const columns = useMemo(() => createColumns(tableActions), [tableActions]);

  // Create table instance
  const table = useEventsTable({
    columns,
    data: filteredEvents,
    initialPageSize: 20,
  });

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Events' }]}
      >
        <Button onClick={() => setIsCreateModalOpen(true)} size="sm">
          <Plus className="mr-1 size-3" />
          Create Event
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Loading State */}
        {isLoading && (
          <div className="space-y-4">
            {/* Toolbar skeleton */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Skeleton className="h-9 w-full sm:w-64" />
              <Skeleton className="h-9 w-full sm:w-72" />
            </div>
            {/* Table skeleton */}
            <div className="rounded-lg border">
              {/* Header */}
              <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24 ml-auto" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="size-4" />
              </div>
              {/* Rows */}
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b last:border-0 px-4 py-3">
                  <Skeleton className="size-4" />
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="size-4" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <p className="mb-3">{error.message}</p>
            <Button onClick={() => refetch()} variant="destructive" size="sm">
              Try Again
            </Button>
          </Alert>
        )}

        {/* Success State */}
        {!isLoading && !error && (
          <>
            {/* Empty State - No events at all */}
            {filteredEvents.length === 0 && (data?.data.length ?? 0) === 0 && (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Calendar className="size-8 text-muted-foreground" />
                  </EmptyMedia>
                  <EmptyTitle>No events yet</EmptyTitle>
                  <EmptyDescription>
                    Create your first event to start organizing and sharing photos
                  </EmptyDescription>
                </EmptyHeader>
                <Button size="sm" onClick={() => setIsCreateModalOpen(true)}>
                  <Plus className="mr-1 size-3" />
                  Create Event
                </Button>
              </Empty>
            )}

            {/* Events Table with controls */}
            {(data?.data.length ?? 0) > 0 && (
              <div className="space-y-4">
                {/* Toolbar: Search + Status Filter */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <DataTableSearch
                    table={table}
                    column="name"
                    placeholder="Filter by event name..."
                  />
                  <ToggleGroup
                    type="single"
                    value={statusFilter}
                    onValueChange={(value) => value && setStatusFilter(value as StatusFilter)}
                    className="justify-start sm:justify-end"
                  >
                    <ToggleGroupItem value="all" aria-label="All events">
                      All
                    </ToggleGroupItem>
                    <ToggleGroupItem value="active" aria-label="Active events">
                      Active
                    </ToggleGroupItem>
                    <ToggleGroupItem value="expiring" aria-label="Expiring soon">
                      Expiring
                    </ToggleGroupItem>
                    <ToggleGroupItem value="expired" aria-label="Expired events">
                      Expired
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* No Results State - when filters applied but no matches */}
                {filteredEvents.length === 0 ? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Search className="size-8 text-muted-foreground" />
                      </EmptyMedia>
                      <EmptyTitle>No events found</EmptyTitle>
                      <EmptyDescription>Try adjusting your filters</EmptyDescription>
                    </EmptyHeader>
                    <Button variant="outline" size="sm" onClick={() => setStatusFilter('all')}>
                      Clear filters
                    </Button>
                  </Empty>
                ) : (
                  <>
                    {/* Table */}
                    <DataTable
                      table={table}
                      emptyMessage="No events found."
                      onRowClick={(event) => navigate(`/events/${event.id}`)}
                    />

                    {/* Pagination */}
                    <DataTablePagination table={table} />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Event Modal */}
      <CreateEventModal open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen} />

      {/* Soft Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteEventId !== null}
        onOpenChange={(open) => !open && setDeleteEventId(null)}
        onConfirm={handleSoftDeleteConfirm}
        type="soft"
        isLoading={deleteEvent.isPending}
      />
    </>
  );
}
