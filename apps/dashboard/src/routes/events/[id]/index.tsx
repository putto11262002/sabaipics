import { useParams, useNavigate } from "react-router";
import { Button } from "@sabaipics/ui/components/button";
import { Alert } from "@sabaipics/ui/components/alert";
import { Skeleton } from "@sabaipics/ui/components/skeleton";
import { Badge } from "@sabaipics/ui/components/badge";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@sabaipics/ui/components/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@sabaipics/ui/components/tabs";
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
import { useState } from "react";

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

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useEvent(id);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "all">("30d");

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
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button
          onClick={() => navigate("/events")}
          variant="ghost"
          size="icon"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex flex-1 items-center justify-between">
          <h1 className="text-3xl font-bold">{event.name}</h1>
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="space-y-6">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="statistics">Statistics</TabsTrigger>
          <TabsTrigger value="photos" disabled>
            Photos
          </TabsTrigger>
          <TabsTrigger value="faces" disabled>
            Faces
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-8">
          {/* Event Information (first) */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Event Information</h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
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

          {/* QR Code Section */}
          <div>
            <h3 className="text-lg font-semibold mb-4">QR Code</h3>
            <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="flex-shrink-0 w-full md:w-auto flex justify-center md:block">
              {event.qrCodeUrl ? (
                <div className="w-48 overflow-hidden rounded-lg border bg-white p-3">
                  <img
                    src={event.qrCodeUrl}
                    alt="Event QR Code"
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-48 w-48 items-center justify-center rounded-lg border bg-muted">
                  <p className="text-sm text-muted-foreground">QR Unavailable</p>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3 w-full md:w-auto">
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
                  className="w-fit"
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
            <div className="flex flex-col md:flex-row items-start gap-4">
            <div className="flex-shrink-0 w-full md:w-auto flex justify-center md:block">
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border bg-muted">
                <div className="text-center">
                  <Presentation className="size-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Preview Coming Soon</p>
                </div>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3 w-full md:w-auto">
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
                className="w-fit"
                disabled
              >
                <ExternalLink className="mr-2 size-4" />
                Open Slideshow (Coming Soon)
              </Button>
            </div>
            </div>
          </div>
        </TabsContent>

        {/* Statistics Tab */}
        <TabsContent value="statistics" className="space-y-6">
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
        </TabsContent>

        {/* Photos Tab (Placeholder) */}
        <TabsContent value="photos">
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col items-center gap-4 text-center">
                <ImageIcon className="size-12 text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold">Photos Coming Soon</h3>
                  <p className="text-sm text-muted-foreground">
                    This feature will be available in a future update
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Faces Tab (Placeholder) */}
        <TabsContent value="faces">
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
