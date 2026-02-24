import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { MessageCircle, Send, ImageIcon, Wallet, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Card,
  CardHeader,
  CardTitle,
  CardFooter,
  CardDescription,
  CardContent,
} from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldDescription } from '@/shared/components/ui/field';
import { Skeleton } from '@/shared/components/ui/skeleton';
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

  // Local state for settings form
  const [photoCap, setPhotoCap] = useState<string | undefined>(undefined);
  const [overageEnabled, setOverageEnabled] = useState<boolean | undefined>(undefined);

  // Sync local state from server data
  const currentPhotoCap = photoCap ?? (settings?.photoCap === null ? 'all' : String(settings?.photoCap ?? 'all'));
  const currentOverageEnabled = overageEnabled ?? (settings?.overageEnabled ?? false);

  const handleSaveSettings = () => {
    const capValue = currentPhotoCap === 'all' ? null : (parseInt(currentPhotoCap) as 5 | 10 | 15 | 20);
    updateSettings.mutate(
      { photoCap: capValue, overageEnabled: currentOverageEnabled },
      {
        onSuccess: () => {
          toast.success('Settings saved');
          setPhotoCap(undefined);
          setOverageEnabled(undefined);
        },
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

      {/* Settings Card */}
      <div className="px-4 pb-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Settings</CardTitle>
            <CardDescription>Configure how many photos are sent per LINE delivery</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="responsive">
                <div>
                  <FieldLabel>Photo cap per delivery</FieldLabel>
                  <FieldDescription>
                    Maximum photos sent in a single delivery
                  </FieldDescription>
                </div>
                <FieldContent>
                  {settingsLoading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={currentPhotoCap}
                      onValueChange={(v) => setPhotoCap(v)}
                    >
                      <SelectTrigger className="w-full">
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
                </FieldContent>
              </Field>
              <Field orientation="responsive">
                <div>
                  <FieldLabel>Allow overage</FieldLabel>
                  <FieldDescription>
                    Use credits when free monthly messages are exhausted
                  </FieldDescription>
                </div>
                <FieldContent>
                  {settingsLoading ? (
                    <Skeleton className="h-6 w-11" />
                  ) : (
                    <Switch
                      variant="primary"
                      checked={currentOverageEnabled}
                      onCheckedChange={(v) => setOverageEnabled(v)}
                    />
                  )}
                </FieldContent>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button
              size="sm"
              onClick={handleSaveSettings}
              disabled={updateSettings.isPending}
            >
              {updateSettings.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <Save className="mr-1 size-4" />
              )}
              Save Settings
            </Button>
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
