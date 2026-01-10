import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@sabaipics/ui/components/button";
import { Alert } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Badge } from "@sabaipics/ui/components/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@sabaipics/ui/components/dropdown-menu";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@sabaipics/ui/components/empty";
import { Calendar, Plus, MoreHorizontal, ExternalLink, Download, Trash2, Eye } from "lucide-react";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import { useEvents } from "../../hooks/events/useEvents";
import { CreateEventModal } from "../../components/events/CreateEventModal";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";

export default function EventsPage() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const { data, isLoading, error, refetch } = useEvents();
  const { copyToClipboard, isCopied } = useCopyToClipboard();

  const handleDownloadQR = async (qrCodeUrl: string, accessCode: string) => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `event-qr-${accessCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download QR code:", error);
    }
  };

  const handleCopyLink = (accessCode: string) => {
    const searchUrl = `${window.location.origin}/search/${accessCode}`;
    copyToClipboard(searchUrl);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Events</h1>
            <p className="text-muted-foreground">Manage your photography events</p>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage your photography events</p>
        </div>
        <Alert variant="destructive">
          <p className="mb-3">{error.message}</p>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            Try Again
          </Button>
        </Alert>
      </div>
    );
  }

  const events = data?.data ?? [];

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Events</h1>
          <p className="text-muted-foreground">Manage your photography events</p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 size-4" />
          Create Event
        </Button>
      </div>

      {/* Empty State */}
      {events.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Calendar className="size-12 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No events yet</EmptyTitle>
            <EmptyDescription>
              Create your first event to start organizing and sharing photos
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 size-4" />
            Create Event
          </Button>
        </Empty>
      )}

      {/* Event List */}
      {events.length > 0 && (
        <div className="space-y-3">
          {events.map((event) => {
            const daysUntilExpiry = differenceInDays(
              parseISO(event.expiresAt),
              new Date()
            );
            const isExpired = daysUntilExpiry <= 0;
            const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

            return (
              <div
                key={event.id}
                className="group flex items-center justify-between rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-lg">{event.name}</h3>
                    {isExpired ? (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    ) : isExpiringSoon ? (
                      <Badge variant="outline" className="border-orange-500 text-orange-500 text-xs">
                        Expires in {daysUntilExpiry}d
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span>
                      Created {formatDistanceToNow(parseISO(event.createdAt), { addSuffix: true })}
                    </span>
                    {event.startDate && event.endDate && (
                      <>
                        <span>•</span>
                        <span>
                          {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span>
                      Expires {formatDistanceToNow(parseISO(event.expiresAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/events/${event.id}`)}
                  >
                    <Eye className="mr-2 size-4" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyLink(event.accessCode)}
                  >
                    <ExternalLink className="mr-2 size-4" />
                    {isCopied ? "Copied!" : "Copy Link"}
                  </Button>
                  {event.qrCodeUrl && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}
                    >
                      <Download className="mr-2 size-4" />
                      QR
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">More options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>More Actions</DropdownMenuLabel>
                      <DropdownMenuItem className="text-destructive">
                        <Trash2 className="mr-2 size-4" />
                        Delete Event
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Event Modal */}
      <CreateEventModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
}
