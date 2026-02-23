import { useState, useDeferredValue } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  RefreshCw,
  Gift,
  Search,
  Plus,
  Loader2,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Calendar } from '@/shared/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useGiftCodes, type GiftCodeListItem } from '../../hooks/gift-codes/use-gift-codes';
import { useCreateGiftCode } from '../../hooks/gift-codes/use-create-gift-code';

// =============================================================================
// Helpers
// =============================================================================

type StatusFilter = 'all' | 'active' | 'inactive' | 'expired';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
];

function getStatusBadge(code: GiftCodeListItem) {
  const now = new Date();
  if (code.expiresAt && new Date(code.expiresAt) < now) {
    return <Badge variant="secondary">Expired</Badge>;
  }
  if (!code.active) {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// =============================================================================
// Create Dialog
// =============================================================================

const createSchema = z.object({
  credits: z.coerce.number().int().min(1, 'At least 1 credit').max(100_000),
  code: z
    .string()
    .regex(/^[A-Z0-9-]*$/, 'Uppercase alphanumeric and hyphens only')
    .optional()
    .or(z.literal('')),
  description: z.string().max(500).optional().or(z.literal('')),
  expiresAt: z.date().optional(),
  creditExpiresInDays: z.coerce.number().int().min(1).max(3650).optional(),
  maxRedemptions: z.coerce.number().int().min(1).optional().or(z.literal('')),
  maxRedemptionsPerUser: z.coerce.number().int().min(1).optional(),
});

type CreateFormValues = z.infer<typeof createSchema>;

function CreateGiftCodeDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createGiftCode = useCreateGiftCode();

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      credits: undefined,
      code: '',
      description: '',
      creditExpiresInDays: 180,
      maxRedemptionsPerUser: 1,
    },
  });

  const onSubmit = (values: CreateFormValues) => {
    createGiftCode.mutate(
      {
        credits: values.credits,
        code: values.code || undefined,
        description: values.description || undefined,
        expiresAt: values.expiresAt?.toISOString(),
        creditExpiresInDays: values.creditExpiresInDays,
        maxRedemptions: typeof values.maxRedemptions === 'number' ? values.maxRedemptions : undefined,
        maxRedemptionsPerUser: values.maxRedemptionsPerUser,
      },
      {
        onSuccess: (data) => {
          toast.success('Gift code created', {
            description: data.data.code,
          });
          setOpen(false);
          form.reset();
        },
        onError: (e) => toast.error('Failed to create gift code', { description: e.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Gift Code</DialogTitle>
          <DialogDescription>
            Create a new gift code for photographers to redeem credits.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="credits">Credits *</Label>
            <Input
              id="credits"
              type="number"
              placeholder="e.g. 500"
              {...form.register('credits')}
            />
            {form.formState.errors.credits && (
              <p className="text-sm text-destructive">{form.formState.errors.credits.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Code (optional, auto-generated)</Label>
            <Input
              id="code"
              placeholder="e.g. GIFT-MYCODE"
              {...form.register('code')}
            />
            {form.formState.errors.code && (
              <p className="text-sm text-destructive">{form.formState.errors.code.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Internal label"
              {...form.register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label>Expires at</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start text-left font-normal"
                >
                  {form.watch('expiresAt')
                    ? format(form.watch('expiresAt')!, 'PPP')
                    : 'Never (no expiry)'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={form.watch('expiresAt')}
                  onSelect={(date) => form.setValue('expiresAt', date)}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="creditExpiresInDays">Credit expiry (days)</Label>
              <Input
                id="creditExpiresInDays"
                type="number"
                {...form.register('creditExpiresInDays')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxRedemptionsPerUser">Max per user</Label>
              <Input
                id="maxRedemptionsPerUser"
                type="number"
                {...form.register('maxRedemptionsPerUser')}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxRedemptions">Max total redemptions</Label>
            <Input
              id="maxRedemptions"
              type="number"
              placeholder="Unlimited"
              {...form.register('maxRedemptions')}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={createGiftCode.isPending}>
              {createGiftCode.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Loading
// =============================================================================

function LoadingSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

// =============================================================================
// Page
// =============================================================================

function GiftCodesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [cursor, setCursor] = useState<string | undefined>();

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useGiftCodes({
    search: deferredSearch || undefined,
    status,
    cursor,
  });

  const codes = data?.data;
  const nextCursor = data?.nextCursor;

  const handleCopyCode = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Gift Codes' }]}>
        <CreateGiftCodeDialog>
          <Button size="sm">
            <Plus className="mr-1 size-4" />
            Create Gift Code
          </Button>
        </CreateGiftCodeDialog>
      </SidebarPageHeader>

      <div className="p-4 space-y-4">
        {/* Search + Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by code or description..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor(undefined);
              }}
              className="pl-9"
            />
          </div>
          <div className="flex gap-1">
            {STATUS_TABS.map((tab) => (
              <Button
                key={tab.value}
                variant={status === tab.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setStatus(tab.value);
                  setCursor(undefined);
                }}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load gift codes</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
            <Button
              variant="destructive"
              size="sm"
              className="mt-2"
              onClick={() => refetch()}
            >
              <RefreshCw className="mr-1 size-4" />
              Retry
            </Button>
          </Alert>
        )}

        {/* Empty state */}
        {!isLoading && !error && codes?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Gift className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {deferredSearch ? 'No gift codes match your search' : 'No gift codes yet'}
            </p>
            {deferredSearch ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearch('');
                  setCursor(undefined);
                }}
              >
                Clear search
              </Button>
            ) : (
              <CreateGiftCodeDialog>
                <Button size="sm" className="mt-2">
                  <Plus className="mr-1 size-4" />
                  Create your first gift code
                </Button>
              </CreateGiftCodeDialog>
            )}
          </div>
        )}

        {/* Table */}
        {(isLoading || (codes && codes.length > 0)) && (
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Redemptions</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <TableBody>
                  {codes?.map((code) => (
                    <TableRow
                      key={code.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/gift-codes/${code.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <code className="font-mono text-sm font-medium">{code.code}</code>
                          <button
                            type="button"
                            onClick={(e) => handleCopyCode(e, code.code)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="size-3.5" />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>{code.credits.toLocaleString()}</TableCell>
                      <TableCell>
                        {code.redemptionCount}
                        {code.maxRedemptions != null && ` / ${code.maxRedemptions}`}
                      </TableCell>
                      <TableCell>{getStatusBadge(code)}</TableCell>
                      <TableCell>{formatDate(code.createdAt)}</TableCell>
                      <TableCell>
                        {code.expiresAt ? formatDate(code.expiresAt) : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              )}
            </Table>
          </div>
        )}

        {/* Load more */}
        {nextCursor && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(nextCursor)}
            >
              Load more
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

export { GiftCodesPage as Component };
