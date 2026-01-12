import { useParams, useNavigate } from "react-router";
import { Button } from "@sabaipics/ui/components/button";
import { Alert } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Badge } from "@sabaipics/ui/components/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@sabaipics/ui/components/card";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@sabaipics/ui/components/dropdown-menu";
import { ArrowLeft, Calendar, MoreVertical, Download, ExternalLink, Trash2, Image as ImageIcon, Clock, Copy, Presentation, BarChart3 } from "lucide-react";
import { parseISO, differenceInDays, differenceInDays as daysBetween, format } from "date-fns";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@sabaipics/ui/components/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@sabaipics/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@sabaipics/ui/components/toggle-group";
import { useEvent } from "../../../hooks/events/useEvent";
import { useCopyToClipboard } from "../../../hooks/use-copy-to-clipboard";
import { useState, useEffect, useRef } from "react";
import { PhotoUploadZone, type FileValidationError } from "../../../components/photos/PhotoUploadZone";
import { PhotosGridView } from "../../../components/photos/PhotosGridView";
import { PhotosListView } from "../../../components/photos/PhotosListView";
import { UploadingTable } from "../../../components/photos/UploadingTable";
import { FailedTable } from "../../../components/photos/FailedTable";
import { SimplePhotoLightbox } from "../../../components/photos/SimplePhotoLightbox";
import { useUploadPhoto } from "../../../hooks/photos/useUploadPhoto";
import { usePhotos, type Photo } from "../../../hooks/photos/usePhotos";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@sabaipics/ui/components/tabs";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { UploadQueueItem } from "../../../types/upload";

// Mock data for photo uploads chart
const generateMockChartData = (days: number) => {
  const data = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: format(date, "yyyy-MM-dd"),
      uploads: Math.floor(Math.random() * 50) + 10,
    });
  }
  return data;
};

const chartConfig = {
  uploads: {
    label: "Photos Uploaded",
    color: "hsl(var(--primary))",
  },
} satisfies ChartConfig;

type TabValue = "details" | "statistics" | "photos" | "faces";
type PhotosTabValue = "photos" | "uploading" | "failed";

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");
  const [activeTab, setActiveTab] = useState<TabValue>("details");

  // Photos tab state
  const [photosTab, setPhotosTab] = useState<PhotosTabValue>("photos");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Photo upload state
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [validationErrors, setValidationErrors] = useState<FileValidationError[]>([]);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const uploadPhotoMutation = useUploadPhoto();
  const queryClient = useQueryClient();

  // Fetch photos for the event
  const photosQuery = usePhotos({ eventId: id });

  // Max concurrent uploads
  const MAX_CONCURRENT_UPLOADS = 5;

  // Track currently uploading IDs (ref to avoid stale closure)
  const uploadQueueRef = useRef<string[]>([]);

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

  // Process queue - starts uploads up to the concurrent limit
  const processQueue = () => {
    if (!id) return;

    const queued = uploadQueue.filter(item => item.status === "queued");
    const available = MAX_CONCURRENT_UPLOADS - uploadQueueRef.current.length;

    if (available <= 0 || queued.length === 0) return;

    const toProcess = queued.slice(0, available);
    toProcess.forEach(item => {
      uploadQueueRef.current.push(item.id);
      uploadFile(item.id, id);
    });
  };

  // Auto-process queue when upload queue changes
  useEffect(() => {
    processQueue();
  }, [uploadQueue]);

  // Photo upload handlers
  const handleFilesSelected = (files: File[]) => {
    if (!id) return;

    // Create queue items for selected files
    const newItems: UploadQueueItem[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random()}`,
      file,
      status: "queued",
    }));

    setUploadQueue((prev) => [...prev, ...newItems]);
    // processQueue will be called automatically via useEffect
  };

  const handleValidationErrors = (errors: FileValidationError[]) => {
    setValidationErrors(errors);
  };

  const uploadFile = async (itemId: string, eventId: string) => {
    // Update status to uploading
    setUploadQueue((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: "uploading" as const } : i))
    );

    try {
      const response = await uploadPhotoMutation.mutateAsync({
        eventId,
        file: uploadQueue.find(i => i.id === itemId)?.file!,
      });

      // Update status to uploaded
      setUploadQueue((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: "uploaded" as const } : i))
      );

      // Add photo to gallery cache (optimistic update)
      queryClient.setQueryData(
        ["event", eventId, "photos"],
        (old: any) => {
          if (!old) return old;

          const newPhoto: Photo = {
            id: response.data.id,
            thumbnailUrl: response.data.thumbnailUrl,
            previewUrl: response.data.previewUrl,
            downloadUrl: response.data.downloadUrl,
            faceCount: response.data.faceCount,
            status: response.data.status,
            uploadedAt: response.data.uploadedAt,
          };

          // Add to first page at the beginning
          return {
            ...old,
            pages: old.pages.map((page: any, index: number) =>
              index === 0
                ? { ...page, data: [newPhoto, ...page.data] }
                : page
            )
          };
        }
      );

      // After 3 seconds, update photo status to "indexed"
      setTimeout(() => {
        queryClient.setQueryData(
          ["event", eventId, "photos"],
          (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page: any) => ({
                ...page,
                data: page.data.map((photo: any) =>
                  photo.id === response.data.id
                    ? { ...photo, status: "indexed" as const, faceCount: Math.floor(Math.random() * 10) }
                    : photo
                )
              }))
            };
          }
        );

        // Remove from upload queue after status change
        setTimeout(() => {
          setUploadQueue((prev) => prev.filter(i => i.id !== itemId));
        }, 1500);
      }, 3000);
    } catch (error) {
      // Handle specific error types
      const err = error as Error & { status?: number; code?: string };
      let errorMessage = err.message || "Upload failed";
      const errorStatus = err.status;

      if (err.status === 402) {
        errorMessage = "Insufficient credits. Purchase more to continue.";
      } else if (err.status === 403) {
        errorMessage = "This event has expired and cannot accept new photos.";
      }

      // Update status to failed with error status
      setUploadQueue((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, status: "failed" as const, error: errorMessage, errorStatus }
            : i
        )
      );
    } finally {
      // Remove from active queue and process next
      uploadQueueRef.current = uploadQueueRef.current.filter(id => id !== itemId);
      processQueue();
    }
  };

  const handleRetryUpload = (itemId: string) => {
    if (!id) return;

    // Reset item status to queued and retry
    setUploadQueue((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, status: "queued" as const, error: undefined, errorStatus: undefined }
          : i
      )
    );
    // processQueue will be called automatically via useEffect
  };

  const handlePhotoClick = (index: number) => {
    setSelectedPhotoIndex(index);
    setIsLightboxOpen(true);
  };

  const handleCloseLightbox = () => {
    setIsLightboxOpen(false);
  };

  // Mock upload queue injection removed - using real uploads only

  const handleRemoveFromQueue = (itemId: string) => {
    setUploadQueue((prev) => prev.filter((i) => i.id !== itemId));
  };

  // Calculate badge counts for tabs
  const uploadingCount = uploadQueue.filter(
    (i) => i.status === "queued" || i.status === "uploading"
  ).length;

  const failedCount = uploadQueue.filter((i) => i.status === "failed").length;

  // Get all photos from all pages
  const allPhotos = photosQuery.data?.pages.flatMap((page) => page.data) ?? [];

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
        <Button
          onClick={() => navigate("/events")}
          variant="ghost"
          className="mb-6"
        >
          <ArrowLeft className="mr-2 size-4" />
          Back to Events
        </Button>

        <Alert variant="destructive">
          <p className="mb-3">{error.message}</p>
          <div className="flex gap-2">
            <Button onClick={() => refetch()} variant="outline" size="sm">
              Try Again
            </Button>
            <Button onClick={() => navigate("/events")} variant="outline" size="sm">
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
  const daysUntilExpiry = differenceInDays(parseISO(event.expiresAt), new Date());
  const isExpired = daysUntilExpiry <= 0;
  const isExpiringSoon = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

  // Calculate days since creation
  const daysSinceCreation = differenceInDays(new Date(), parseISO(event.createdAt));

  // Calculate event duration
  const eventDuration = event.startDate && event.endDate
    ? daysBetween(parseISO(event.endDate), parseISO(event.startDate)) + 1
    : null;

  return (
    <div className="container mx-auto p-6">
      {/* Header Section with Tabs */}
      <div className="mb-6 border-b">
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
                {isCopied ? "Link Copied!" : "Copy Search Link"}
              </DropdownMenuItem>
              {event.qrCodeUrl && (
                <DropdownMenuItem onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}>
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

        {/* Custom Tabs at Bottom of Header */}
        <div className="flex gap-6 -mb-px">
          <button
            onClick={() => setActiveTab("details")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "details"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("statistics")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "statistics"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Statistics
          </button>
          <button
            onClick={() => setActiveTab("photos")}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "photos"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Photos
          </button>
          <button
            disabled
            className="pb-3 text-sm font-medium text-muted-foreground opacity-50 cursor-not-allowed border-b-2 border-transparent"
          >
            Faces
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {/* Details Tab */}
      {activeTab === "details" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Left Column: QR Code + Slideshow (60%) */}
          <div className="md:col-span-3 space-y-8">
            {/* QR Code Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">QR Code</h3>
              <div className="space-y-4">
                <div>
                  {event.qrCodeUrl ? (
                    <div className="w-64 overflow-hidden rounded-lg border bg-white p-4">
                      <img
                        src={event.qrCodeUrl}
                        alt="Event QR Code"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : (
                    <div className="flex h-64 w-64 items-center justify-center rounded-lg border bg-muted">
                      <p className="text-sm text-muted-foreground">QR Unavailable</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Share this QR code with guests to search for their photos
                  </p>

                  {/* Search URL */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Search URL</label>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`${window.location.origin}/search/${event.accessCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-primary hover:underline truncate"
                      >
                        {window.location.origin}/search/{event.accessCode}
                      </a>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => handleCopyLink(event.accessCode)}
                        title="Copy search link"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {event.qrCodeUrl && (
                    <Button
                      onClick={() => handleDownloadQR(event.qrCodeUrl!, event.accessCode)}
                      variant="outline"
                      className="w-full"
                    >
                      <Download className="mr-2 size-4" />
                      Download QR Code
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Slideshow Section */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Slideshow</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex h-64 w-64 items-center justify-center rounded-lg border bg-muted">
                    <div className="text-center">
                      <Presentation className="size-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Preview Coming Soon</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    View all event photos in slideshow mode
                  </p>

                  {/* Slideshow URL */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Slideshow URL</label>
                    <div className="flex items-center gap-2 mt-1">
                      <a
                        href={`${window.location.origin}/slideshow/${event.accessCode}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm text-primary hover:underline truncate"
                      >
                        {window.location.origin}/slideshow/{event.accessCode}
                      </a>
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyToClipboard(`${window.location.origin}/slideshow/${event.accessCode}`)}
                        title="Copy slideshow link"
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    disabled
                  >
                    <ExternalLink className="mr-2 size-4" />
                    Open Slideshow (Coming Soon)
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Event Information (40%) */}
          <div className="md:col-span-2">
            <h3 className="text-lg font-semibold mb-4">Event Information</h3>
            <div className="space-y-4">
              {/* Event Name with Status Badge */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Event Name</label>
                <div className="mt-1 flex items-center gap-2">
                  <p className="font-medium">{event.name}</p>
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
              </div>

              {/* Start Date */}
              {event.startDate && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Start Date</label>
                  <p className="mt-1">{new Date(event.startDate).toLocaleString()}</p>
                </div>
              )}

              {/* End Date */}
              {event.endDate && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">End Date</label>
                  <p className="mt-1">{new Date(event.endDate).toLocaleString()}</p>
                </div>
              )}

              {/* Created */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Created</label>
                <p className="mt-1">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>

              {/* Expires */}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Expires</label>
                <p className="mt-1">
                  {new Date(event.expiresAt).toLocaleString()}
                  {isExpiringSoon && (
                    <span className="ml-2 text-sm text-destructive">
                      (⚠️ {daysUntilExpiry}d left)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Statistics Tab */}
      {activeTab === "statistics" && (
        <div className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Total Photos Stat */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <ImageIcon className="size-4" />
                  Total Photos
                </CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums">
                  0
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  No photos uploaded yet
                </p>
              </CardContent>
            </Card>

            {/* Storage Used Stat */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <BarChart3 className="size-4" />
                  Storage Used
                </CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums">
                  0 MB
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  Of event storage
                </p>
              </CardContent>
            </Card>

            {/* Days Active Stat */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Clock className="size-4" />
                  Days Active
                </CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums">
                  {daysSinceCreation}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {daysUntilExpiry} days until expiry
                </p>
              </CardContent>
            </Card>

            {/* Event Status Stat */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Calendar className="size-4" />
                  Status
                </CardDescription>
                <CardTitle className="text-xl">
                  {isExpired ? (
                    <Badge variant="destructive" className="mt-1">Expired</Badge>
                  ) : isExpiringSoon ? (
                    <Badge variant="outline" className="mt-1 border-orange-500 text-orange-500">
                      Expires in {daysUntilExpiry}d
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="mt-1 bg-green-100 text-green-800">
                      Active
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {eventDuration ? `${eventDuration} day event` : "Duration not set"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Photo Uploads Chart */}
          <Card>
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Photo Uploads Over Time</CardTitle>
                <CardDescription>
                  Daily upload activity for the last {timeRange === "7d" ? "7 days" : timeRange === "30d" ? "30 days" : "all time"}
                </CardDescription>
              </div>

              {/* Time Range Selector - Desktop */}
              <ToggleGroup
                type="single"
                value={timeRange}
                onValueChange={(value) => value && setTimeRange(value as "7d" | "30d" | "all")}
                className="hidden sm:flex"
              >
                <ToggleGroupItem value="7d" variant="outline">
                  7 days
                </ToggleGroupItem>
                <ToggleGroupItem value="30d" variant="outline">
                  30 days
                </ToggleGroupItem>
                <ToggleGroupItem value="all" variant="outline">
                  All time
                </ToggleGroupItem>
              </ToggleGroup>

              {/* Time Range Selector - Mobile */}
              <Select
                value={timeRange}
                onValueChange={(value) => setTimeRange(value as "7d" | "30d" | "all")}
              >
                <SelectTrigger className="w-[140px] sm:hidden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <ChartContainer config={chartConfig} className="h-[300px] w-full">
                <AreaChart
                  data={generateMockChartData(timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90)}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="fillUploads" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor="var(--color-uploads)"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="var(--color-uploads)"
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={32}
                    tickFormatter={(value: string) => {
                      const date = new Date(value);
                      return format(date, "MMM d");
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="line" />}
                  />
                  <Area
                    dataKey="uploads"
                    type="natural"
                    fill="url(#fillUploads)"
                    fillOpacity={0.4}
                    stroke="var(--color-uploads)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Photos Tab */}
      {activeTab === "photos" && (
        <div className="space-y-6">
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <div>
                <p className="mb-2 font-medium">
                  {validationErrors.length} {validationErrors.length === 1 ? "file was" : "files were"} rejected:
                </p>
                <div className="space-y-1 text-sm">
                  {validationErrors.map((error, index) => (
                    <p key={index}>
                      <span className="font-medium">{error.file.name}:</span> {error.error}
                    </p>
                  ))}
                </div>
              </div>
            </Alert>
          )}

          {/* Upload dropzone - always visible above tabs */}
          <PhotoUploadZone
            onFilesSelected={handleFilesSelected}
            onValidationErrors={handleValidationErrors}
            disabled={isExpired}
          />

          {/* Three tabs: Photos | Uploading | Failed */}
          <Tabs value={photosTab} onValueChange={(v) => setPhotosTab(v as PhotosTabValue)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="photos">Photos</TabsTrigger>
              <TabsTrigger value="uploading">
                Uploading
                {uploadingCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
                  >
                    {uploadingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="failed">
                Failed
                {failedCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-2 h-5 min-w-5 rounded-full px-1 font-mono tabular-nums"
                  >
                    {failedCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            {/* Photos Tab Content */}
            <TabsContent value="photos" className="space-y-4">
              {/* View Toggle */}
              <div className="flex justify-end items-center">
                <ToggleGroup
                  type="single"
                  value={viewMode}
                  onValueChange={(v) => v && setViewMode(v as "grid" | "list")}
                >
                  <ToggleGroupItem value="grid" aria-label="Grid view">
                    <LayoutGrid className="size-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="list" aria-label="List view">
                    <ListIcon className="size-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {/* Grid or List View */}
              {viewMode === "grid" ? (
                <PhotosGridView
                  photos={allPhotos}
                  isLoading={photosQuery.isLoading}
                  onPhotoClick={handlePhotoClick}
                />
              ) : (
                <PhotosListView
                  photos={allPhotos}
                  isLoading={photosQuery.isLoading}
                  onPhotoClick={handlePhotoClick}
                />
              )}

              {/* Load More Button */}
              {photosQuery.hasNextPage && (
                <div className="flex justify-center pt-4">
                  <Button
                    onClick={() => photosQuery.fetchNextPage()}
                    disabled={photosQuery.isFetchingNextPage}
                    variant="outline"
                  >
                    {photosQuery.isFetchingNextPage ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Uploading Tab Content */}
            <TabsContent value="uploading">
              <UploadingTable items={uploadQueue} />
            </TabsContent>

            {/* Failed Tab Content */}
            <TabsContent value="failed">
              <FailedTable
                items={uploadQueue}
                onRetry={handleRetryUpload}
                onRemove={handleRemoveFromQueue}
              />
            </TabsContent>
          </Tabs>

          {/* Lightbox */}
          <SimplePhotoLightbox
            photos={allPhotos}
            index={selectedPhotoIndex}
            open={isLightboxOpen}
            onClose={handleCloseLightbox}
          />
        </div>
      )}

      {/* Faces Tab (Placeholder) */}
      {activeTab === "faces" && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4 text-center">
              <Calendar className="size-12 text-muted-foreground" />
              <div>
                <h3 className="text-lg font-semibold">Face Recognition Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                  This feature will be available in a future update
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
