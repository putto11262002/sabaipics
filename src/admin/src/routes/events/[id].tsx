import { useParams, useNavigate, Link } from 'react-router';
import {
  AlertCircle,
  RefreshCw,
  Trash2,
  Image,
  HardDrive,
  Users,
  Search,
  Upload,
  XCircle,
  Loader2,
  Calendar,
  Mail,
  User,
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
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useAdminEvent } from '../../hooks/events/use-admin-event';
import { useSoftDeleteEvent } from '../../hooks/events/use-soft-delete-event';
import { useHardDeleteEvent } from '../../hooks/events/use-hard-delete-event';

// =============================================================================
// Helpers
// =============================================================================

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

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(event: { deletedAt: string | null; expiresAt: string }) {
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

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

// =============================================================================
// Page
// =============================================================================

function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: eventData, isLoading, error, refetch } = useAdminEvent(id!);
  const softDelete = useSoftDeleteEvent();
  const hardDelete = useHardDeleteEvent();

  const detail = eventData?.data;
  const event = detail?.event;
  const photographer = detail?.photographer;
  const stats = detail?.stats;

  const isTrashed = !!event?.deletedAt;

  const handleSoftDelete = () => {
    softDelete.mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast.success('Event moved to trash');
          navigate('/events');
        },
        onError: (e) => toast.error('Failed to delete event', { description: e.message }),
      },
    );
  };

  const handleHardDelete = () => {
    hardDelete.mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast.success('Event permanently deleted');
          navigate('/events');
        },
        onError: (e) => toast.error('Failed to permanently delete event', { description: e.message }),
      },
    );
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Events', href: '/events' },
          { label: event?.name || 'Event' },
        ]}
      >
        {event && (
          <div className="flex items-center gap-2">
            {isTrashed ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={hardDelete.isPending}
                  >
                    {hardDelete.isPending ? (
                      <Loader2 className="mr-1 size-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 size-4" />
                    )}
                    Delete Permanently
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Permanently delete this event?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{event.name}" and all associated data
                      including photos, face data, and storage. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleHardDelete}>
                      Delete permanently
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={softDelete.isPending}
                  >
                    {softDelete.isPending ? (
                      <Loader2 className="mr-1 size-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-1 size-4" />
                    )}
                    Move to Trash
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Move event to trash?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will soft-delete "{event.name}" on behalf of the photographer.
                      The event will be moved to trash and can be permanently deleted later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSoftDelete}>
                      Move to Trash
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
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
            <AlertTitle>Failed to load event</AlertTitle>
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

        {/* Event detail */}
        {event && stats && photographer && (
          <>
            {/* Event name + status */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold">{event.name}</h2>
                {getStatusBadge(event)}
              </div>
              {event.subtitle && (
                <p className="text-sm text-muted-foreground">{event.subtitle}</p>
              )}
            </div>

            {/* Stat cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard title="Photos" value={stats.photoCount} icon={Image} />
              <StatCard title="Storage" value={formatBytes(stats.storageBytes)} icon={HardDrive} />
              <StatCard title="Faces Indexed" value={stats.faceCount} icon={Users} />
              <StatCard title="Participant Searches" value={stats.searchCount} icon={Search} />
              <StatCard title="Uploads Completed" value={stats.uploads.completed} icon={Upload} />
              <StatCard title="Uploads Failed" value={stats.uploads.failed} icon={XCircle} />
            </div>

            {/* Event details */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Details</h3>
              <FieldGroup>
                <Field label="Event Name" value={event.name} icon={Calendar} />
                <Field
                  label="Photographer"
                  value={
                    <div>
                      <Link to={`/users/${photographer.id}`} className="hover:underline">
                        {photographer.name || 'Unnamed'}
                      </Link>
                      <div className="text-muted-foreground font-normal">{photographer.email}</div>
                    </div>
                  }
                  icon={User}
                />
                <Field label="Status" value={getStatusBadge(event)} />
                <Field label="Created" value={formatDateTime(event.createdAt)} />
                <Field label="Expires" value={formatDateTime(event.expiresAt)} />
                {event.startDate && (
                  <Field label="Start Date" value={formatDateTime(event.startDate)} />
                )}
                {event.endDate && (
                  <Field label="End Date" value={formatDateTime(event.endDate)} />
                )}
                {event.deletedAt && (
                  <Field label="Deleted At" value={formatDateTime(event.deletedAt)} icon={Trash2} />
                )}
              </FieldGroup>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export { EventDetailPage as Component };
