import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { differenceInDays, parseISO } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  CreditCard,
  Gift,
  HardDrive,
  Image,
  RefreshCw,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react';

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
  CardContent,
  CardDescription,
  CardFooter,
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
import { Separator } from '@/shared/components/ui/separator';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { GiftCodeDialog } from '../../components/credits/GiftCodeDialog';
import { useValidatePromoCode } from '../../hooks/credits/useValidatePromoCode';
import { useCreditHistory } from '../../hooks/credits/useCreditHistory';
import { LatestAnnouncementBanner } from '../../components/announcements/latest-announcement-card';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function DashboardPage() {
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [promoCodeFromUrl, setPromoCodeFromUrl] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState<string>('');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isRefetching } = useDashboardData();
  const { data: eventsData, isLoading: eventsLoading } = useEvents(0, 10);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();
  const { data: creditData, isLoading: creditLoading } = useCreditHistory(0, 1);
  const dashboardData = data?.data;
  const creditSummary = creditData?.data?.summary;

  // Validate promo code to determine if it's a gift or discount code
  const validateQuery = useValidatePromoCode(promoCodeFromUrl || '', !!promoCodeFromUrl);

  // Handle promo code from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      // Gift codes → redirect to credits page which handles redemption
      if (code.startsWith('GIFT-')) {
        navigate(`/settings/credits?code=${encodeURIComponent(code)}`, { replace: true });
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
        <Button size="icon-xs" variant="outline" onClick={() => setGiftOpen(true)} className="md:size-auto md:px-3 md:py-1.5">
          <Gift className="size-4 md:mr-1" />
          <span className="hidden md:inline">Redeem</span>
        </Button>
        <Button size="icon-xs" onClick={() => setCreditDialogOpen(true)} className="md:size-auto md:px-3 md:py-1.5">
          <CreditCard className="size-4 md:mr-1" />
          <span className="hidden md:inline">Buy</span>
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

            {/* Credit Stats */}
            <div className="grid auto-rows-min gap-4 md:grid-cols-2">
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Credit Balance</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {creditLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      (creditSummary?.balance ?? dashboardData.credits.balance).toLocaleString()
                    )}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <Wallet className="mr-1 size-4" />
                  Available credits
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Used This Month</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {creditLoading ? (
                      <Skeleton className="h-8 w-20" />
                    ) : (
                      (creditSummary?.usedThisMonth ?? 0).toLocaleString()
                    )}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <TrendingDown className="mr-1 size-4" />
                  Credits used this month
                </CardFooter>
              </Card>
            </div>

            {/* Photographer Stats */}
            <div className="grid auto-rows-min gap-4 md:grid-cols-3">
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Total Photos</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {dashboardData.stats.totalPhotos.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <Image className="mr-1 size-4" />
                  Across {dashboardData.stats.totalEvents} events
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Faces Detected</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {dashboardData.stats.totalFaces.toLocaleString()}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <Users className="mr-1 size-4" />
                  Total faces indexed
                </CardFooter>
              </Card>

              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Storage Used</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatBytes(dashboardData.stats.totalStorage)}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <HardDrive className="mr-1 size-4" />
                  Total photo storage
                </CardFooter>
              </Card>
            </div>

            {/* Events Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Recent Events</h2>
                <Button asChild variant="outline">
                  <Link to="/events">
                    <Calendar className="mr-1 size-4" />
                    All Events
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

      <CreditTopUpDialog
        open={creditDialogOpen}
        onOpenChange={setCreditDialogOpen}
        initialPromoCode={discountCode || undefined}
      />
      <GiftCodeDialog open={giftOpen} onOpenChange={setGiftOpen} />
    </>
  );
}
