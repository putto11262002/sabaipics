import { useParams, useNavigate, Outlet, NavLink } from 'react-router';
import { Button } from '@sabaipics/ui/components/button';
import { Alert } from '@sabaipics/ui/components/alert';
import { Skeleton } from '@sabaipics/ui/components/skeleton';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@sabaipics/ui/components/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/ui/components/dropdown-menu';
import { MoreVertical, Download, ExternalLink, Trash2 } from 'lucide-react';
import { useEvent } from '../../../hooks/events/useEvent';
import { useCopyToClipboard } from '../../../hooks/use-copy-to-clipboard';
import { cn } from '@sabaipics/ui/lib/utils';
import { ScrollArea } from '@sabaipics/ui/components/scroll-area';

const tabs = [
  { name: 'Details', path: 'details' },
  { name: 'Upload', path: 'upload' },
  { name: 'Photos', path: 'photos' },
  { name: 'Statistics', path: 'statistics' },
  { name: 'Faces', path: 'faces', disabled: true },
];

export default function EventDetailLayout() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleDownloadQR = async (qrCodeUrl: string, accessCode: string) => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-qr-${accessCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download QR code:', error);
    }
  };

  const handleCopyLink = (accessCode: string) => {
    const searchUrl = `${window.location.origin}/search/${accessCode}`;
    copyToClipboard(searchUrl);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="mb-6 h-10 w-32" />
        <Skeleton className="mb-6 h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
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
    );
  }

  if (!data?.data) {
    return null;
  }

  const event = data.data;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header Section with Tabs */}
      <div className="flex-shrink-0 border-b container mx-auto px-6 pt-4">
        {/* Breadcrumb and Actions */}
        <div className="mb-4 flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/events">Events</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{event.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="size-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleCopyLink(event.accessCode)}>
                <ExternalLink className="mr-2 size-4" />
                {isCopied ? 'Link Copied!' : 'Copy Search Link'}
              </DropdownMenuItem>
              {event.qrCodeUrl && (
                <DropdownMenuItem
                  onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}
                >
                  <Download className="mr-2 size-4" />
                  Download QR Code
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive">
                <Trash2 className="mr-2 size-4" />
                Delete Event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-6 -mb-px">
          {tabs.map((tab) =>
            tab.disabled ? (
              <span
                key={tab.path}
                className="pb-3 text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed border-b-2 border-transparent"
              >
                {tab.name}
              </span>
            ) : (
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
            ),
          )}
        </div>
      </div>

      {/* Tab Content via Outlet */}
      <ScrollArea className="flex-1 grow container mx-auto px-6 overflow-scroll">
        <Outlet />
      </ScrollArea>
    </div>
  );
}
