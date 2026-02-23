import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertCircle,
  RefreshCw,
  Power,
  PowerOff,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Spinner } from '@/shared/components/ui/spinner';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/shared/components/ui/field';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useAnnouncement } from '../../hooks/announcements/use-announcement';
import { useUpdateAnnouncement } from '../../hooks/announcements/use-update-announcement';
import { useDeleteAnnouncement } from '../../hooks/announcements/use-delete-announcement';

// =============================================================================
// Helpers
// =============================================================================

const TAG_OPTIONS = [
  { value: 'feature', label: 'Feature' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'fix', label: 'Fix' },
  { value: 'maintenance', label: 'Maintenance' },
] as const;

function getStatusBadge(item: { active: boolean; publishedAt: string | null }) {
  const now = new Date();
  if (item.active && item.publishedAt && new Date(item.publishedAt) <= now) {
    return <Badge variant="success">Active</Badge>;
  }
  return <Badge variant="secondary">Draft</Badge>;
}

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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// =============================================================================
// Edit Form
// =============================================================================

const editSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  subtitle: z.string().max(500).optional().or(z.literal('')),
  content: z.string().min(1, 'Content is required'),
  tag: z.enum(['feature', 'improvement', 'fix', 'maintenance', '']).optional(),
  publishedAt: z.date().nullable().optional(),
  active: z.boolean(),
});

type EditFormValues = z.infer<typeof editSchema>;

// =============================================================================
// Page
// =============================================================================

function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  const { data: announcementData, isLoading, error, refetch } = useAnnouncement(id!);
  const updateAnnouncement = useUpdateAnnouncement();
  const deleteAnnouncement = useDeleteAnnouncement();

  const announcement = announcementData?.data;

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    values: announcement
      ? {
          title: announcement.title,
          subtitle: announcement.subtitle ?? '',
          content: announcement.content,
          tag: (announcement.tag as EditFormValues['tag']) ?? '',
          publishedAt: announcement.publishedAt ? new Date(announcement.publishedAt) : null,
          active: announcement.active,
        }
      : undefined,
  });

  const onSubmit = (values: EditFormValues) => {
    updateAnnouncement.mutate(
      {
        id: id!,
        title: values.title,
        subtitle: values.subtitle || null,
        content: values.content,
        tag: (values.tag as 'feature' | 'improvement' | 'fix' | 'maintenance') || null,
        publishedAt: values.publishedAt?.toISOString() ?? null,
        active: values.active,
      },
      {
        onSuccess: () => toast.success('Announcement updated'),
        onError: (e) => toast.error('Failed to update', { description: e.message }),
      },
    );
  };

  const handleToggleActive = () => {
    if (!announcement) return;
    updateAnnouncement.mutate(
      { id: id!, active: !announcement.active },
      {
        onSuccess: () =>
          toast.success(announcement.active ? 'Announcement deactivated' : 'Announcement activated'),
        onError: (e) =>
          toast.error('Failed to update', { description: e.message }),
      },
    );
  };

  const handleDelete = () => {
    deleteAnnouncement.mutate(
      { id: id! },
      {
        onSuccess: () => {
          toast.success('Announcement deleted');
          navigate('/announcements');
        },
        onError: (e) => toast.error('Failed to delete', { description: e.message }),
      },
    );
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Announcements', href: '/announcements' },
          { label: announcement?.title || 'Announcement' },
        ]}
      >
        {announcement && (
          <div className="flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant={announcement.active ? 'destructive' : 'default'}
                  size="sm"
                  disabled={updateAnnouncement.isPending}
                >
                  {updateAnnouncement.isPending ? (
                    <Spinner className="mr-1 size-3" />
                  ) : announcement.active ? (
                    <PowerOff className="mr-1 size-4" />
                  ) : (
                    <Power className="mr-1 size-4" />
                  )}
                  {announcement.active ? 'Deactivate' : 'Activate'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {announcement.active ? 'Deactivate announcement?' : 'Activate announcement?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {announcement.active
                      ? 'This announcement will no longer be visible to the public.'
                      : 'This announcement will become visible if it has a published date.'}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleToggleActive}>
                    {announcement.active ? 'Deactivate' : 'Activate'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleteAnnouncement.isPending}>
                  {deleteAnnouncement.isPending ? (
                    <Spinner className="mr-1 size-3" />
                  ) : (
                    <Trash2 className="mr-1 size-4" />
                  )}
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete &quot;{announcement.title}&quot;. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </SidebarPageHeader>

      <div className="mx-auto w-full max-w-6xl space-y-6 p-4">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-5 w-40" />
            <div className="space-y-5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load announcement</AlertTitle>
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

        {/* Detail */}
        {announcement && (
          <>
            {/* Meta info */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-semibold">{announcement.title}</span>
                {getStatusBadge(announcement)}
                {getTagBadge(announcement.tag)}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>Created {formatDate(announcement.createdAt)} by {announcement.createdBy}</span>
                {announcement.publishedAt && <span>Published {formatDate(announcement.publishedAt)}</span>}
              </div>
            </div>

            {/* Edit form */}
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <section className="space-y-4">
                <div>
                  <h2 className="text-base font-medium">Edit Announcement</h2>
                </div>

                <div className="space-y-5">
                  <Controller
                    name="title"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid || undefined}>
                        <FieldLabel htmlFor="title">Title</FieldLabel>
                        <FieldContent>
                          <Input {...field} id="title" aria-invalid={fieldState.invalid} />
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
                        <FieldLabel htmlFor="subtitle">Subtitle</FieldLabel>
                        <FieldContent>
                          <Input {...field} id="subtitle" placeholder="Optional short summary" aria-invalid={fieldState.invalid} />
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
                        <div className="flex items-center justify-between">
                          <FieldLabel htmlFor="content">Content (Markdown)</FieldLabel>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowPreview(!showPreview)}
                          >
                            {showPreview ? 'Edit' : 'Preview'}
                          </Button>
                        </div>
                        <FieldContent>
                          {showPreview ? (
                            <div className="rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none min-h-[150px]">
                              <Markdown remarkPlugins={[remarkGfm]}>
                                {field.value}
                              </Markdown>
                            </div>
                          ) : (
                            <Textarea
                              {...field}
                              id="content"
                              rows={8}
                              aria-invalid={fieldState.invalid}
                            />
                          )}
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
                        <FieldLabel htmlFor="tag">Tag</FieldLabel>
                        <FieldContent>
                          <Select
                            value={field.value || 'none'}
                            onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                          >
                            <SelectTrigger id="tag" className="w-full">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
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
                        <FieldLabel htmlFor="publishedAt">Published at</FieldLabel>
                        <FieldContent>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                id="publishedAt"
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
                                selected={field.value ?? undefined}
                                onSelect={(date) => field.onChange(date ?? null)}
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
                        <FieldLabel htmlFor="active">Active</FieldLabel>
                        <FieldContent>
                          <Switch
                            id="active"
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked)}
                          />
                          <FieldDescription>
                            Only active announcements with a published date are visible
                          </FieldDescription>
                        </FieldContent>
                      </Field>
                    )}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Button size="sm" type="submit" disabled={updateAnnouncement.isPending || !form.formState.isDirty}>
                    {updateAnnouncement.isPending && <Spinner className="mr-1 size-3" />}
                    Save Changes
                  </Button>
                </div>
              </section>
            </form>

            {/* Markdown preview */}
            <section className="space-y-3">
              <h2 className="text-base font-medium">Content Preview</h2>
              <div className="rounded-md border p-4 prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {announcement.content}
                </Markdown>
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}

export { AnnouncementDetailPage as Component };
