import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertCircle, MessageCircle, Send, ImageIcon, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useLineDeliveryStats } from '../../hooks/line-delivery/useLineDeliveryStats';
import { useLineDeliveryHistory } from '../../hooks/line-delivery/useLineDeliveryHistory';
import { useLineDeliverySettings } from '../../hooks/line-delivery/useLineDeliverySettings';
import { useUpdateLineDeliverySettings } from '../../hooks/line-delivery/useUpdateLineDeliverySettings';

const PHOTO_CAP_OPTIONS = [
  { label: '5 photos', value: '5' },
  { label: '10 photos', value: '10' },
  { label: '15 photos', value: '15' },
  { label: '20 photos', value: '20' },
  { label: 'All photos', value: 'all' },
] as const;

function statusBadge(status: string) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-success/10 text-success">Sent</Badge>;
    case 'partial':
      return <Badge className="bg-warning/10 text-warning">Partial</Badge>;
    case 'failed':
      return <Badge className="bg-destructive/10 text-destructive">Failed</Badge>;
    case 'pending':
      return <Badge className="bg-info/10 text-info">Pending</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export default function LineDeliveryPage() {
  const [page, setPage] = useState(0);

  // Data hooks
  const { data: statsData, isLoading: statsLoading } = useLineDeliveryStats();
  const { data: historyData, isLoading: historyLoading } = useLineDeliveryHistory(page, 20);
  const { data: settingsData, isLoading: settingsLoading } = useLineDeliverySettings();
  const updateSettings = useUpdateLineDeliverySettings();

  const stats = statsData?.data;
  const history = historyData?.data;
  const settings = settingsData?.data;

  const currentPhotoCap = settings?.photoCap === null ? 'all' : String(settings?.photoCap ?? 'all');
  const currentOverageEnabled = settings?.overageEnabled ?? false;

  const handleUpdateSetting = (patch: Partial<{ photoCap: string; overageEnabled: boolean }>) => {
    const capStr = patch.photoCap ?? currentPhotoCap;
    const overage = patch.overageEnabled ?? currentOverageEnabled;
    const capValue = capStr === 'all' ? null : (parseInt(capStr) as 5 | 10 | 15 | 20);
    updateSettings.mutate(
      { photoCap: capValue, overageEnabled: overage },
      {
        onError: (err) => {
          toast.error('Failed to save settings', { description: err.message });
        },
      },
    );
  };

  const totalPages = history ? Math.ceil(history.total / 20) : 0;

  return (
    <div className="flex h-full flex-col">
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'LINE Delivery' },
        ]}
      />

      {/* Stats Cards */}
      <div className="grid auto-rows-min gap-4 px-4 py-4 md:grid-cols-3">
        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Messages Used</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                `${stats?.allowance.used ?? 0} / ${stats?.allowance.limit ?? 100}`
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <MessageCircle className="mr-1 size-4" />
            {stats?.allowance.remaining ?? 0} remaining this month
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Photos Sent</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (stats?.month.photoCount ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <ImageIcon className="mr-1 size-4" />
            This month
          </CardFooter>
        </Card>

        <Card className="@container/card">
          <CardHeader>
            <CardDescription>Credits Spent</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                (stats?.month.creditsSpent ?? 0).toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            <Wallet className="mr-1 size-4" />
            Overage credits this month
          </CardFooter>
        </Card>
      </div>

      {/* Low Allowance Warning */}
      {stats && stats.allowance.used >= stats.allowance.limit * 0.8 && (
        <div className="px-4">
          <Alert variant={stats.allowance.remaining === 0 ? 'destructive' : 'warning'}>
            <AlertCircle className="size-4" />
            <AlertTitle>
              {stats.allowance.remaining === 0
                ? 'Monthly message allowance exhausted'
                : `${stats.allowance.remaining} free messages remaining`}
            </AlertTitle>
            <AlertDescription>
              {stats.allowance.remaining === 0
                ? currentOverageEnabled
                  ? 'All further deliveries will be charged 1 credit per message.'
                  : 'Overage is disabled — deliveries are blocked until next month. Enable overage below to continue sending.'
                : currentOverageEnabled
                  ? `You've used ${stats.allowance.used} of ${stats.allowance.limit} free messages. After that, each message costs 1 credit.`
                  : `You've used ${stats.allowance.used} of ${stats.allowance.limit} free messages. Enable overage below to keep sending after the limit.`}
            </AlertDescription>
          </Alert>
        </div>
      )}

      {/* Settings */}
      <div className="px-4 pb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Settings</CardTitle>
          </CardHeader>
          <CardFooter className="flex flex-col items-stretch gap-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Allow overage</p>
                <p className="text-xs text-muted-foreground">Use credits when free messages are exhausted</p>
              </div>
              {settingsLoading ? (
                <Skeleton className="h-6 w-11" />
              ) : (
                <Switch
                  variant="primary"
                  checked={currentOverageEnabled}
                  onCheckedChange={(v) => handleUpdateSetting({ overageEnabled: v })}
                  disabled={updateSettings.isPending}
                />
              )}
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Photo cap</p>
                <p className="text-xs text-muted-foreground">Max photos per delivery</p>
              </div>
              {settingsLoading ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <Select
                  value={currentPhotoCap}
                  onValueChange={(v) => handleUpdateSetting({ photoCap: v })}
                  disabled={updateSettings.isPending}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PHOTO_CAP_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Delivery History */}
      <div className="flex-1 px-4 pb-4">
        <h3 className="mb-3 text-sm font-medium">Delivery History</h3>
        <div className="overflow-x-auto rounded-md border">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Photos</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead>Charged</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historyLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (history?.entries.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Send className="mx-auto mb-2 size-8" />
                    No LINE deliveries yet
                  </TableCell>
                </TableRow>
              ) : (
                history?.entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">
                      {format(parseISO(entry.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {entry.eventName ?? 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.photoCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.messageCount}
                    </TableCell>
                    <TableCell>
                      {entry.creditCharged ? (
                        <Badge className="bg-warning/10 text-warning">Yes</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Free</span>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(entry.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
