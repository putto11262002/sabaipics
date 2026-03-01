import { useState, useDeferredValue, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  RefreshCw,
  Megaphone,
  Search,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/shared/components/ui/field';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Calendar } from '@/shared/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import {
  useAnnouncements,
  type AnnouncementListItem,
} from '../../hooks/announcements/use-announcements';
import { useCreateAnnouncement } from '../../hooks/announcements/use-create-announcement';

// =============================================================================
// Helpers
// =============================================================================

type StatusFilter = 'all' | 'active' | 'draft';
type TagFilter = 'feature' | 'improvement' | 'fix' | 'maintenance' | undefined;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
];

const TAG_OPTIONS = [
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'fix', label: 'Fix' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;

function getTagBadge(tag: string | null) {
  if (!tag) return null;
  const colors: Record<string, string> = {
    feature: 'bg-info/10 text-info',
    improvement: 'bg-success/10 text-success',
    fix: 'bg-warning/10 text-warning',
    maintenance: 'bg-destructive/10 text-destructive',
  };
  return (
    <Badge variant="outline" className={colors[tag]}>
      {tag}
    </Badge>
  );
}

function getStatusBadge(item: AnnouncementListItem) {
  const now = new Date();
  if (item.active && item.publishedAt && new Date(item.publishedAt) <= now) {
    return <Badge variant="success">Active</Badge>;
  }
  return <Badge variant="secondary">Draft</Badge>;
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
  title: z.string().min(1, 'Title is required').max(200),
  subtitle: z.string().max(500).optional().or(z.literal('')),
  content: z.string().min(1, 'Content is required'),
  tag: z.enum(['feature', 'improvement', 'fix', 'maintenance']).optional(),
  publishedAt: z.date().optional(),
  active: z.boolean(),
});

type CreateFormValues = z.infer<typeof createSchema>;

function CreateAnnouncementDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const createAnnouncement = useCreateAnnouncement();

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      title: '',
      subtitle: '',
      content: '',
      active: false,
    },
  });

  const onSubmit = (values: CreateFormValues) => {
    createAnnouncement.mutate(
      {
        title: values.title,
        subtitle: values.subtitle || undefined,
        content: values.content,
        tag: values.tag,
        publishedAt: values.publishedAt?.toISOString(),
        active: values.active,
      },
      {
        onSuccess: () => {
          toast.success('Announcement created');
          setOpen(false);
          form.reset();
        },
        onError: (e) => toast.error('Failed to create announcement', { description: e.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Announcement</DialogTitle>
          <DialogDescription>
            Create a new product announcement.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Controller
            name="title"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="create-title">Title</FieldLabel>
                <FieldContent>
                  <Input {...field} id="create-title" placeholder="e.g. New feature: Batch uploads" aria-invalid={fieldState.invalid} />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="subtitle"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="create-subtitle">Subtitle</FieldLabel>
                <FieldContent>
                  <Input {...field} id="create-subtitle" placeholder="Brief description" aria-invalid={fieldState.invalid} />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="content"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="create-content">Content (Markdown)</FieldLabel>
                <FieldContent>
                  <Textarea {...field} id="create-content" placeholder="Write your announcement in Markdown..." rows={6} aria-invalid={fieldState.invalid} />
                  <FieldError errors={fieldState.error ? [fieldState.error] : undefined} />
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="tag"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="create-tag">Tag</FieldLabel>
                <FieldContent>
                  <Select
                    value={field.value ?? ''}
                    onValueChange={(v) => field.onChange(v || undefined)}
                  >
                    <SelectTrigger id="create-tag" className="w-full">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {TAG_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="publishedAt"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="create-publishedAt">Published at</FieldLabel>
                <FieldContent>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="create-publishedAt"
                        type="button"
                        variant="outline"
                        className="w-full justify-start text-left font-normal"
                      >
                        {field.value ? format(field.value, 'PPP') : 'Not set'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => field.onChange(date)}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </FieldContent>
              </Field>
            )}
          />

          <Controller
            name="active"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="create-active">Active</FieldLabel>
                <FieldContent>
                  <Switch
                    id="create-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                  <FieldDescription>Publish immediately if a date is set</FieldDescription>
                </FieldContent>
              </Field>
            )}
          />

          <DialogFooter>
            <Button type="submit" disabled={createAnnouncement.isPending}>
              {createAnnouncement.isPending && <Spinner className="mr-1 size-3" />}
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
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
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

function AnnouncementsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [tag, setTag] = useState<TagFilter>(undefined);
  const [cursor, setCursor] = useState<string | undefined>();

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useAnnouncements({
    search: deferredSearch || undefined,
    tag,
    status,
    cursor,
  });

  // Accumulate pages — reset when filters change, append on "Load more"
  const [accumulated, setAccumulated] = useState<AnnouncementListItem[]>([]);
  const prevCursorRef = useRef(cursor);

  useEffect(() => {
    if (!data?.data) return;
    if (prevCursorRef.current === cursor && cursor !== undefined) {
      // Same cursor means filters changed or initial load — already handled
    }
    if (cursor === undefined) {
      // Filters changed — replace
      setAccumulated(data.data);
    } else {
      // Load more — append
      setAccumulated((prev) => [...prev, ...data.data]);
    }
    prevCursorRef.current = cursor;
  }, [data, cursor]);

  const items = accumulated;
  const nextCursor = data?.nextCursor;

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Announcements' }]}>
        <CreateAnnouncementDialog>
          <Button size="sm">
            <Plus className="mr-1 size-4" />
            Create Announcement
          </Button>
        </CreateAnnouncementDialog>
      </SidebarPageHeader>

      <div className="p-4 space-y-4">
        {/* Search + Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by title or subtitle..."
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
          <Select
            value={tag ?? 'all'}
            onValueChange={(v) => {
              setTag(v === 'all' ? undefined : (v as TagFilter));
              setCursor(undefined);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {TAG_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load announcements</AlertTitle>
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
        {!isLoading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Megaphone className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {deferredSearch || tag ? 'No announcements match your filters' : 'No announcements yet'}
            </p>
            {deferredSearch || tag ? (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearch('');
                  setTag(undefined);
                  setCursor(undefined);
                }}
              >
                Clear filters
              </Button>
            ) : (
              <CreateAnnouncementDialog>
                <Button size="sm" className="mt-2">
                  <Plus className="mr-1 size-4" />
                  Create your first announcement
                </Button>
              </CreateAnnouncementDialog>
            )}
          </div>
        )}

        {/* Table */}
        {(isLoading || items.length > 0) && (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <TableBody>
                  {items.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/announcements/${item.id}`)}
                    >
                      <TableCell>
                        <div>
                          <span className="font-medium">{item.title}</span>
                          {item.subtitle && (
                            <p className="text-sm text-muted-foreground truncate max-w-xs">
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getTagBadge(item.tag)}</TableCell>
                      <TableCell>{getStatusBadge(item)}</TableCell>
                      <TableCell>
                        {item.publishedAt ? formatDate(item.publishedAt) : '—'}
                      </TableCell>
                      <TableCell>{formatDate(item.createdAt)}</TableCell>
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

export { AnnouncementsPage as Component };
