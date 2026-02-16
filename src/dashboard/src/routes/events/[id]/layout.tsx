import { useState } from 'react';
import { useParams, useNavigate, Outlet, NavLink, Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/shared/components/ui/button';
import { Alert } from '@/shared/components/ui/alert';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { MoreVertical, ExternalLink } from 'lucide-react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { useEvent } from '../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../../hooks/events/useDownloadQR';
import { useDeleteEvent } from '../../../hooks/events/useDeleteEvent';
import { useHardDeleteEvent } from '../../../hooks/events/useHardDeleteEvent';
import { DeleteConfirmDialog } from '../../../components/events/DeleteConfirmDialog';

import { cn } from '@/shared/utils/ui';

const tabs = [
  { name: 'Details', path: 'details' },
  { name: 'Upload', path: 'upload' },
  { name: 'Photos', path: 'photos' },
  { name: 'Color', path: 'color' },
  { name: 'FTP', path: 'ftp' },
  // { name: 'Statistics', path: 'statistics' },
];

export default function EventDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const deleteEvent = useDeleteEvent();
  const hardDeleteEvent = useHardDeleteEvent();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [hardDeleteDialogOpen, setHardDeleteDialogOpen] = useState(false);

  const handleCopyLink = (eventId: string) => {
    const searchUrl = `${window.location.origin}/participant/events/${eventId}/search`;
    copyToClipboard(searchUrl);
  };

  // Handle soft delete
  const handleSoftDelete = () => {
    if (!id) return;

    deleteEvent.mutate(
      { eventId: id },
      {
        onSuccess: () => {
          toast.success('Event deleted');
          setDeleteDialogOpen(false);
          navigate('/events');
        },
        onError: (error) => {
          toast.error('Delete failed', {
            description: error.message,
          });
          setDeleteDialogOpen(false);
        },
      }
    );
  };

  // Handle hard delete
  const handleHardDelete = () => {
    if (!id) return;

    hardDeleteEvent.mutate(
      { eventId: id },
      {
        onSuccess: () => {
          toast.success('Event permanently deleted');
          setHardDeleteDialogOpen(false);
          navigate('/events');
        },
        onError: (error) => {
          toast.error('Hard delete failed', {
            description: error.message,
          });
          setHardDeleteDialogOpen(false);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <>
        <SidebarPageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Events', href: '/events' },
            { label: 'Loading...' },
          ]}
        />
        <div className="p-4">
          <Skeleton className="mb-6 h-10 w-full" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <SidebarPageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Events', href: '/events' },
            { label: 'Error' },
          ]}
        />
        <div className="p-4">
          <Alert variant="destructive">
            <p className="mb-3">{error.message}</p>
            <div className="flex gap-2">
              <Button onClick={() => refetch()} variant="outline" size="sm">
                Try Again
              </Button>
              <Button onClick={() => navigate('/events')} variant="outline" size="sm">
                Back to Events
              </Button>
            </div>
          </Alert>
        </div>
      </>
    );
  }

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  return (
    <div className="flex flex-col">
      {/* Header */}
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Events', href: '/events' },
          { label: event.name },
        ]}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="text-muted-foreground">
              <MoreVertical className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handleCopyLink(event.id)}>
              {isCopied ? 'Link Copied!' : 'Copy Search Link'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => downloadQR.mutate({ eventId: event.id, eventName: event.name })}
            >
              Download QR Code
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteDialogOpen(true)}>
              Delete Event
            </DropdownMenuItem>
            {import.meta.env.DEV && (
              <DropdownMenuItem
                className="text-destructive font-bold"
                onClick={() => setHardDeleteDialogOpen(true)}
              >
                Hard Delete (Dev)
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarPageHeader>

      {/* Tab Navigation (sticky) */}
      <div className="sticky top-16 z-10 border-b bg-background px-4">
        <div className="flex gap-6 -mb-px">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/events/${id}/${tab.path}`}
              className={({ isActive }) =>
                cn(
                  'pb-3 text-sm font-medium transition-colors border-b-2',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )
              }
            >
              {tab.name}
            </NavLink>
          ))}
          <Link
            to={`/events/${id}/slideshow-editor`}
            className="flex items-center gap-1.5 border-b-2 border-transparent pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Slideshow
            <ExternalLink className="size-3" />
          </Link>
        </div>
      </div>

      {/* Tab Content */}
      <div className="px-4">
        <Outlet />
      </div>

      {/* Delete Confirmation Dialogs */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleSoftDelete}
        type="soft"
        isLoading={deleteEvent.isPending}
      />

      {import.meta.env.DEV && (
        <DeleteConfirmDialog
          open={hardDeleteDialogOpen}
          onOpenChange={setHardDeleteDialogOpen}
          onConfirm={handleHardDelete}
          type="hard"
          isLoading={hardDeleteEvent.isPending}
        />
      )}
    </div>
  );
}
