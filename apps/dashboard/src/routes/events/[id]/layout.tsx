import { useParams, useNavigate, Outlet, NavLink } from 'react-router';
import { Button } from '@sabaipics/uiv3/components/button';
import { Alert } from '@sabaipics/uiv3/components/alert';
import { Skeleton } from '@sabaipics/uiv3/components/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { useEvent } from '../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../../hooks/events/useDownloadQR';
import { cn } from '@sabaipics/uiv3/lib/utils';

const tabs = [
  { name: 'Details', path: 'details' },
  { name: 'Upload', path: 'upload' },
  { name: 'Photos', path: 'photos' },
  { name: 'Statistics', path: 'statistics' },
];

export default function EventDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();

  const handleCopyLink = (eventId: string) => {
    const searchUrl = `${window.location.origin}/participant/events/${eventId}/search`;
    copyToClipboard(searchUrl);
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
    <div className="flex h-full flex-col">
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
            <DropdownMenuItem className="text-destructive">Delete Event</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarPageHeader>

      {/* Tab Navigation */}
      <div className="flex-shrink-0 border-b px-4">
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
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto px-4">
        <Outlet />
      </div>
    </div>
  );
}
