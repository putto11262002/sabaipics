import { useMemo, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { differenceInDays, parseISO } from 'date-fns';
import {
  AlertCircle,
  Calendar,
  CreditCard,
  Image as ImageIcon,
  RefreshCw,
  Smile,
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
  CardAction,
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
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import { CreditTopUpDialog } from '../../components/credits/CreditTopUpDialog';
import { GiftCodeDialog } from '../../components/credits/GiftCodeDialog';
import { useValidatePromoCode } from '../../hooks/credits/useValidatePromoCode';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';

export function DashboardPage() {
  const [creditDialogOpen, setCreditDialogOpen] = useState(false);
  const [giftDialogOpen, setGiftDialogOpen] = useState(false);
  const [promoCodeFromUrl, setPromoCodeFromUrl] = useState<string | null>(null);
  const [giftCode, setGiftCode] = useState<string>('');
  const [discountCode, setDiscountCode] = useState<string>('');
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const navigate = useNavigate();
  const { data, isLoading, error, refetch, isRefetching } = useDashboardData();
  const { data: eventsData, isLoading: eventsLoading } = useEvents(0, 10);
  const { copyToClipboard, isCopied } = useCopyToClipboard();
  const downloadQR = useDownloadQR();

  const dashboardData = data?.data;

  // Validate promo code to determine if it's a gift code
  const validateQuery = useValidatePromoCode(promoCodeFromUrl || '', !!promoCodeFromUrl);

  // Handle promo code from query params (gift or discount codes)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (code) {
      setPromoCodeFromUrl(code);
      // Keep code in URL - Stripe will redirect back with code on cancel
    }
  }, []);

  // Handle back button - close dialogs instead of navigating away
  useEffect(() => {
    const handlePopState = () => {
      if (giftDialogOpen) {
        setGiftDialogOpen(false);
        setGiftCode('');
      } else if (creditDialogOpen) {
        setCreditDialogOpen(false);
        setDiscountCode('');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [giftDialogOpen, creditDialogOpen]);

  // Open appropriate dialog when validation completes
  useEffect(() => {
    if (validateQuery.isSuccess && promoCodeFromUrl) {
      const isGiftCode = validateQuery.data?.data?.type === 'gift';
      if (isGiftCode) {
        setGiftCode(promoCodeFromUrl);
        setGiftDialogOpen(true);
      } else {
        setDiscountCode(promoCodeFromUrl);
        setCreditDialogOpen(true);
      }
      // Clear the URL code after processing
      setPromoCodeFromUrl(null);
    }
  }, [validateQuery.isSuccess, promoCodeFromUrl, validateQuery.data]);

  // Show error if promo code validation fails
  useEffect(() => {
    if (validateQuery.isError && promoCodeFromUrl) {
      const message = validateQuery.error instanceof Error
        ? validateQuery.error.message
        : 'This promo code is invalid or expired';

      setErrorMessage(message);
      setErrorDialogOpen(true);

      // Clear the code after showing error
      setPromoCodeFromUrl(null);

      // Clean URL to remove invalid code
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [validateQuery.isError, promoCodeFromUrl, validateQuery.error]);

  // Helper to check if credits are expiring soon (within 7 days)
  const isExpiringSoon = (expiry: string | null) => {
    if (!expiry) return false;
    const days = differenceInDays(parseISO(expiry), new Date());
    return days <= 7 && days >= 0;
  };

  const handleCopyLink = (eventId: string) => {
    const searchUrl = `${window.location.origin}/participant/events/${eventId}/search`;
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
  const columns = useMemo(() => createColumns(tableActions), [tableActions]);

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
        {/* Loading State */}
        {isLoading && (
          <>
            <div className="grid auto-rows-min gap-4 md:grid-cols-3">
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
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
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
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
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Credits Expiring Soon</AlertTitle>
                  <AlertDescription>
                    {dashboardData.credits.balance} credits expire on{' '}
                    {new Date(dashboardData.credits.nearestExpiry).toLocaleDateString()}. Purchase
                    more credits to avoid service interruption.
                  </AlertDescription>
                </Alert>
              )}

            {/* Stats Cards Grid */}
            <div className="grid auto-rows-min gap-4 md:grid-cols-3">
              {/* Credit Balance Card */}
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Credit Balance</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {dashboardData.credits.balance} credits
                  </CardTitle>
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isRefetching}
                      title="Refresh balance"
                    >
                      <RefreshCw className={`size-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  1 credit per photo
                </CardFooter>
              </Card>

              {/* Total Photos Card */}
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Total Photos</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {dashboardData.stats.totalPhotos}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <ImageIcon className="mr-1 size-4" />
                  Across all events
                </CardFooter>
              </Card>

              {/* Total Faces Card */}
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Total Faces</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {dashboardData.stats.totalFaces}
                  </CardTitle>
                </CardHeader>
                <CardFooter className="text-sm text-muted-foreground">
                  <Smile className="mr-1 size-4" />
                  Detected and indexed
                </CardFooter>
              </Card>
            </div>

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
                      <Calendar className="size-12 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>No events yet</EmptyTitle>
                    <EmptyDescription>
                      Create your first event to start organizing and sharing photos
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                /* Just the table - no search, no pagination for dashboard */
                <DataTable
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

      {/* Gift Code Dialog (for 100% free credit gifts) */}
      {giftCode && (
        <GiftCodeDialog
          open={giftDialogOpen}
          onOpenChange={setGiftDialogOpen}
          giftCode={giftCode}
        />
      )}

      {/* Error Dialog for invalid/expired promo codes */}
      <AlertDialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invalid Promo Code</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
