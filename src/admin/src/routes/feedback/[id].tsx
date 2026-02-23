import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Textarea } from '@/shared/components/ui/textarea';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useAdminFeedbackDetail } from '../../hooks/feedback/use-admin-feedback-detail';
import { useUpdateFeedback } from '../../hooks/feedback/use-update-feedback';

// =============================================================================
// Helpers
// =============================================================================

type FeedbackStatus = 'new' | 'reviewed' | 'planned' | 'completed' | 'dismissed';

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
  { value: 'dismissed', label: 'Dismissed' },
];

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCategoryLabel(category: string) {
  switch (category) {
    case 'feature_request':
      return 'Feature Request';
    case 'suggestion':
      return 'Suggestion';
    default:
      return 'General';
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'dashboard':
      return 'Dashboard';
    case 'event_app':
      return 'Event App';
    case 'ios':
      return 'iOS';
    default:
      return source;
  }
}

// =============================================================================
// Page
// =============================================================================

function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: feedbackData, isLoading, error, refetch } = useAdminFeedbackDetail(id!);
  const updateFeedback = useUpdateFeedback();

  const detail = feedbackData?.data;

  const [status, setStatus] = useState<FeedbackStatus>('new');
  const [adminNote, setAdminNote] = useState('');

  useEffect(() => {
    if (detail) {
      setStatus(detail.status as FeedbackStatus);
      setAdminNote(detail.adminNote ?? '');
    }
  }, [detail]);

  const handleSave = () => {
    updateFeedback.mutate(
      {
        id: id!,
        status,
        adminNote: adminNote.trim() || null,
      },
      {
        onSuccess: () => toast.success('Feedback updated'),
        onError: (e) => toast.error('Failed to update feedback', { description: e.message }),
      },
    );
  };

  const shortId = id?.slice(0, 8) ?? '';

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Feedback', href: '/feedback' },
          { label: `#${shortId}` },
        ]}
      />

      <div className="p-4 space-y-6 max-w-3xl">
        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-6 w-32" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load feedback</AlertTitle>
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
        {detail && (
          <>
            {/* Feedback content */}
            <Card>
              <CardHeader>
                <CardTitle>Feedback Content</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{detail.content}</p>
              </CardContent>
            </Card>

            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Category</p>
                    <Badge variant="outline">{getCategoryLabel(detail.category)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Source</p>
                    <Badge variant="secondary">{getSourceLabel(detail.source)}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Submitter</p>
                    <p className="text-sm font-medium">
                      {detail.photographerName || detail.photographerEmail || 'Anonymous'}
                    </p>
                    {detail.photographerName && detail.photographerEmail && (
                      <p className="text-xs text-muted-foreground">{detail.photographerEmail}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Submitted</p>
                    <p className="text-sm font-medium">{formatDateTime(detail.createdAt)}</p>
                  </div>
                  {detail.eventId && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Event ID</p>
                      <p className="text-sm font-mono">{detail.eventId}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Admin actions */}
            <Card>
              <CardHeader>
                <CardTitle>Admin Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as FeedbackStatus)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="adminNote">Admin Note</Label>
                  <Textarea
                    id="adminNote"
                    placeholder="Internal notes about this feedback..."
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    rows={4}
                  />
                </div>

                <Button onClick={handleSave} disabled={updateFeedback.isPending}>
                  {updateFeedback.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}

export { FeedbackDetailPage as Component };
