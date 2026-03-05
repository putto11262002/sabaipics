import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { differenceInDays, parseISO, format, subDays, eachDayOfInterval } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  Clock,
  CreditCard,
  RefreshCw,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/shared/components/ui/chart';

import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useDashboardData } from '../../hooks/dashboard/useDashboardData';
import { useEvents } from '../../hooks/events/useEvents';
import { useCopyToClipboard } from '../../hooks/use-copy-to-clipboard';
import { useDownloadQR } from '../../hooks/events/useDownloadQR';
import { DataTable, useEventsTable, createColumns } from '../../components/events-table';
import type { EventTableActions } from '../../components/events-table';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui/empty';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { useValidatePromoCode } from '../../hooks/credits/useValidatePromoCode';
import { useCreditHistory } from '../../hooks/credits/useCreditHistory';
import { useUsageBySource } from '../../hooks/credits/useUsageBySource';
import { LatestAnnouncementBanner } from '../../components/announcements/latest-announcement-card';

const SOURCE_COLORS: Record<string, string> = {
  upload: 'oklch(0.75 0.12 250)',
  image_enhancement: 'oklch(0.78 0.10 170)',
  line_delivery: 'oklch(0.80 0.10 85)',
  admin_adjustment: 'oklch(0.75 0.10 310)',
};

const usageChartConfig = {
  upload: { label: 'Photo Upload', color: 'oklch(0.65 0.15 250 / 0.7)' },
  image_enhancement: { label: 'Image Enhancement', color: 'oklch(0.70 0.15 170 / 0.7)' },
  line_delivery: { label: 'LINE Delivery', color: 'oklch(0.75 0.15 85 / 0.7)' },
  admin_adjustment: { label: 'Admin', color: 'oklch(0.65 0.15 310 / 0.7)' },
} satisfies ChartConfig;

export function DashboardPage() {
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [promoCodeFromUrl, setPromoCodeFromUrl] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState<string>('');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isRefetching } = useDashboardData();
  const { data: eventsData, isLoading: eventsLoading } = useEvents(0, 10);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const { data: creditData, isLoading: creditLoading } = useCreditHistory(0, 1);
  const { data: usageData, isLoading: usageLoading } = useUsageBySource(14);

  const dashboardData = data?.data;
  const creditSummary = creditData?.data?.summary;

  // Transform usage data into stacked bar format with all 14 days filled
  const chartData = useMemo(() => {
    if (!usageData) return [];
    const byDate = new Map<string, Record<string, number>>();
    for (const row of usageData) {
      const existing = byDate.get(row.date) ?? {};
      byDate.set(row.date, { ...existing, [row.source]: row.credits });
    }
    const today = new Date();
    return eachDayOfInterval({ start: subDays(today, 13), end: today }).map((d) => {
      const dateStr = format(d, 'yyyy-MM-dd');
      return { date: dateStr, ...(byDate.get(dateStr) ?? {}) };
    });
  }, [usageData]);

  const activeSources = useMemo(() => {
    if (!usageData) return [];
    return Array.from(new Set(usageData.map((d) => d.source)));
  }, [usageData]);

  // Validate promo code to determine if it's a gift or discount code
  const validateQuery = useValidatePromoCode(promoCodeFromUrl || '', !!promoCodeFromUrl);

  // Handle promo code from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      // Gift codes → redirect to credits page which handles redemption
      if (code.startsWith('GIFT-')) {
        navigate(`/credits?code=${encodeURIComponent(code)}`, { replace: true });
      } else {
        // Discount codes → validate via Stripe then open CreditTopUpDialog
        setPromoCodeFromUrl(code);
      }
    }
  }, [navigate]);

  // Handle back button - close dialogs instead of navigating away
  useEffect(() => {
    const handlePopState = () => {
      if (creditDialogOpen) {
        setCreditDialogOpen(false);
        setDiscountCode('');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [creditDialogOpen]);

  // Open discount code dialog when Stripe validation completes
  useEffect(() => {
    if (validateQuery.isSuccess && promoCodeFromUrl) {
      setDiscountCode(promoCodeFromUrl);
      setCreditDialogOpen(true);
      setPromoCodeFromUrl(null);
    }
  }, [validateQuery.isSuccess, promoCodeFromUrl]);

  // Clean URL if discount code validation fails
  useEffect(() => {
    if (validateQuery.isError && promoCodeFromUrl) {
      setPromoCodeFromUrl(null);
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [validateQuery.isError, promoCodeFromUrl]);

  // Helper to check if credits are expiring soon (within 7 days)
  const isExpiringSoon = (expiry: string | null) => {
    if (!expiry) return false;
    const days = differenceInDays(parseISO(expiry), new Date());
    return days <= 7 && days >= 0;
  };

  const handleCopyLink = (eventId: string) => {
    const searchUrl = `${import.meta.env.VITE_EVENT_URL}/${eventId}/search`;
    copyToClipboard(searchUrl);
  };

  // Create action handlers for the table
  const tableActions: EventTableActions = {
    onViewEvent: (eventId: string) => navigate(`/events/${eventId}`),
    onCopySearchLink: (eventId: string) => handleCopyLink(eventId),
    onDownloadQR: (eventId: string, eventName: string) => downloadQR.mutate({ eventId, eventName }),
    onDeleteEvent: (eventId: string) => {
      // TODO: Implement delete event
      console.log('Delete event:', eventId);
    },
    isCopied,
  };

  // Create columns with action handlers
  const columns = useMemo(() => createColumns(tableActions).filter((c) => c.id !== 'select'), [tableActions]);

  // Create table instance - show all 10 items without pagination
  const table = useEventsTable({
    columns,
    data: eventsData?.data ?? [],
    initialPageSize: 10,
  });

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Dashboard' }]}>
        <Button size="sm" onClick={() => setCreditDialogOpen(true)}>
          <CreditCard className="mr-1 size-4" />
          Buy Credits
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Latest Announcement */}
        <LatestAnnouncementBanner />

        {/* Loading State */}
        {isLoading && (
          <>
            <Skeleton className="h-[280px] w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </>
        )}

        {/* Error State */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Error loading dashboard</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message}</span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => refetch()}
                disabled={isRefetching}
              >
                {isRefetching ? (
                  <Spinner className="mr-1 size-3" />
                ) : (
                  <RefreshCw className="mr-1 size-3" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {dashboardData && (
          <>
            {/* Credit Expiry Warning */}
            {dashboardData.credits.nearestExpiry &&
              isExpiringSoon(dashboardData.credits.nearestExpiry) && (
                <Alert variant="warning">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Credits Expiring Soon</AlertTitle>
                  <AlertDescription>
                    {dashboardData.credits.balance} credits expire on{' '}
                    {new Date(dashboardData.credits.nearestExpiry).toLocaleDateString()}. Purchase
                    more credits to avoid service interruption.
                  </AlertDescription>
                </Alert>
              )}

            {/* Credit Overview */}
            <Card>
              <CardHeader>
                <CardDescription className="text-xs">Available Balance</CardDescription>
                <CardTitle className="text-3xl font-semibold tabular-nums text-primary">
                  {creditLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <>{(creditSummary?.balance ?? dashboardData.credits.balance).toLocaleString()}</>
                  )}
                </CardTitle>
                <CardAction>
                  <Button variant="link" size="sm" asChild>
                    <Link to="/credits">View details</Link>
                  </Button>
                </CardAction>
              </CardHeader>

              <CardContent>
                {/* Summary stats row */}
                <div className="mb-4 flex gap-6 text-sm">
                  {creditLoading ? (
                    <>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-32" />
                    </>
                  ) : (
                    <>
                      {(creditSummary?.expiringSoon ?? 0) > 0 && (
                        <span className="flex items-center gap-1 text-warning">
                          <Clock className="size-3.5" />
                          {creditSummary!.expiringSoon.toLocaleString()} expiring soon
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <TrendingDown className="size-3.5" />
                        {(creditSummary?.usedThisMonth ?? 0).toLocaleString()} used this month
                      </span>
                    </>
                  )}
                </div>

                {/* Mini usage chart */}
                {usageLoading ? (
                  <Skeleton className="h-[160px] w-full" />
                ) : (
                  <ChartContainer config={usageChartConfig} className="h-[160px] w-full">
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        minTickGap={40}
                        tickFormatter={(value: string) => format(new Date(value), 'MMM d')}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={30} />
                      <ChartTooltip
                        cursor={false}
                        content={
                          <ChartTooltipContent
                            indicator="line"
                            labelFormatter={(value: string) => format(new Date(value), 'MMM d, yyyy')}
                          />
                        }
                      />
                      {activeSources.map((source) => (
                        <Bar
                          key={source}
                          dataKey={source}
                          fill={SOURCE_COLORS[source] ?? 'var(--color-chart-5)'}
                          fillOpacity={0.5}
                          stackId="a"
                          radius={[0, 0, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>

            </Card>

            {/* Events Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Events</h2>
                <Button asChild variant="outline" size="sm">
                  <Link to="/events">
                    <Calendar className="mr-1 size-4" />
                    View All Events
                  </Link>
                </Button>
              </div>

              {eventsLoading ? (
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
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 border-b last:border-0 px-4 py-3"
                    >
                      <Skeleton className="size-4" />
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-4 w-20 ml-auto" />
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="size-4" />
                    </div>
                  ))}
                </div>
              ) : !eventsData?.data.length ? (
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
                  <Button size="sm" asChild>
                    <Link to="/events">
                      <Calendar className="mr-1 size-3" />
                      Create Event
                    </Link>
                  </Button>
                </Empty>
              ) : (
                /* Just the table - no search, no pagination for dashboard */
                <DataTable className="bg-card"
                  table={table}
                  emptyMessage="No events yet."
                  onRowClick={(event) => navigate(`/events/${event.id}`)}
                />
              )}
            </div>
          </>
        )}
      </div>

      {/* Credit Top-Up Dialog (for regular purchases and discount codes) */}
      <CreditTopUpDialog
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
        initialPromoCode={discountCode || undefined}
      />
    </>
  );
}
