import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@sabaipics/ui/components/button";
import { Alert } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Badge } from "@sabaipics/ui/components/badge";
import { Input } from "@sabaipics/ui/components/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@sabaipics/ui/components/pagination";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@sabaipics/ui/components/toggle-group";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@sabaipics/ui/components/breadcrumb";
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
import { Calendar, Plus, MoreHorizontal, ExternalLink, Download, Trash2, Eye, Search } from "lucide-react";
import { formatDistanceToNow, parseISO, differenceInDays } from "date-fns";
import { useEvents } from "../../hooks/events/useEvents";
import { CreateEventModal } from "../../components/events/CreateEventModal";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";

type StatusFilter = "all" | "active" | "expiring" | "expired";

export default function EventsPage() {
  const navigate = useNavigate();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { data, isLoading, error, refetch } = useEvents(page, 20);
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

  // Filter and search events
  const filteredEvents = useMemo(() => {
    if (!data?.data) return [];

    let filtered = data.data;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter((event) =>
        event.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((event) => {
        const daysUntilExpiry = differenceInDays(
          parseISO(event.expiresAt),
          new Date()
        );
        const isExpired = daysUntilExpiry <= 0;
        const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;
        const isActive = daysUntilExpiry > 7;

        if (statusFilter === "expired") return isExpired;
        if (statusFilter === "expiring") return isExpiringSoon;
        if (statusFilter === "active") return isActive;
        return true;
      });
    }

    return filtered;
  }, [data?.data, searchQuery, statusFilter]);

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-8 flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Events</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
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
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Events</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
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

  return (
    <div className="container mx-auto p-6">
      {/* Header with Breadcrumb */}
      <div className="mb-6 flex items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Events</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="mr-2 size-4" />
          Create Event
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search events..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
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

      {/* Empty State */}
      {filteredEvents.length === 0 && (data?.data.length ?? 0) === 0 && (
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

      {/* No Results State (when filters applied but no matches) */}
      {filteredEvents.length === 0 && (data?.data.length ?? 0) > 0 && (
        <div className="text-center py-12">
          <Search className="size-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No events found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Try adjusting your search or filters
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {/* Event List */}
      {filteredEvents.length > 0 && (
        <>
        <div className="space-y-3">
          {filteredEvents.map((event) => {
            const daysUntilExpiry = differenceInDays(
              parseISO(event.expiresAt),
              new Date()
            );
            const isExpired = daysUntilExpiry <= 0;
            const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

            return (
              <div
                key={event.id}
                className="group flex items-center justify-between gap-4 rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-lg truncate">{event.name}</h3>
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
                  <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-muted-foreground">
                    <span>
                      Created {formatDistanceToNow(parseISO(event.createdAt), { addSuffix: true })}
                    </span>
                    {event.startDate && event.endDate && (
                      <>
                        <span className="hidden sm:inline">•</span>
                        <span className="hidden sm:inline">
                          {new Date(event.startDate).toLocaleDateString()} - {new Date(event.endDate).toLocaleDateString()}
                        </span>
                      </>
                    )}
                    <span className="hidden sm:inline">•</span>
                    <span>
                      Expires {formatDistanceToNow(parseISO(event.expiresAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => navigate(`/events/${event.id}`)}>
                        <Eye className="mr-2 size-4" />
                        View Event
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleCopyLink(event.accessCode)}>
                        <ExternalLink className="mr-2 size-4" />
                        {isCopied ? "Link Copied!" : "Copy Search Link"}
                      </DropdownMenuItem>
                      {event.qrCodeUrl && (
                        <DropdownMenuItem onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}>
                          <Download className="mr-2 size-4" />
                          Download QR Code
                        </DropdownMenuItem>
                      )}
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

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="mt-6 flex justify-center">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className={!data.pagination.hasPrevPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: data.pagination.totalPages }, (_, i) => i).map((pageNum) => {
                  // Show first page, last page, current page, and pages around current
                  const showPage =
                    pageNum === 0 ||
                    pageNum === data.pagination.totalPages - 1 ||
                    Math.abs(pageNum - page) <= 1;

                  if (!showPage) {
                    // Show ellipsis for gaps
                    if (pageNum === page - 2 || pageNum === page + 2) {
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      );
                    }
                    return null;
                  }

                  return (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setPage(pageNum)}
                        isActive={pageNum === page}
                        className="cursor-pointer"
                      >
                        {pageNum + 1}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages - 1, p + 1))}
                    className={!data.pagination.hasNextPage ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
        </>
      )}

      {/* Create Event Modal */}
      <CreateEventModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
      />
    </div>
  );
}
