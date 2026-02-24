import { useState, useDeferredValue } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, RefreshCw, Search, MessageSquare } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { SidebarPageHeader } from '../../components/shell/sidebar-page-header';
import { useAdminFeedback, type AdminFeedbackListItem } from '../../hooks/feedback/use-admin-feedback';

// =============================================================================
// Helpers
// =============================================================================

type StatusFilter = 'all' | 'new' | 'reviewed' | 'planned' | 'completed' | 'dismissed';
type CategoryFilter = 'all' | 'suggestion' | 'feature_request' | 'general';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'planned', label: 'Planned' },
  { value: 'completed', label: 'Completed' },
  { value: 'dismissed', label: 'Dismissed' },
];

const CATEGORY_TABS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'general', label: 'General' },
];

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'new':
      return <Badge variant="info">{status}</Badge>;
    case 'reviewed':
      return <Badge variant="secondary">{status}</Badge>;
    case 'planned':
      return <Badge variant="warning">{status}</Badge>;
    case 'completed':
      return <Badge variant="success">{status}</Badge>;
    case 'dismissed':
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getCategoryBadge(category: string) {
  switch (category) {
    case 'feature_request':
      return <Badge variant="outline">Feature Request</Badge>;
    case 'suggestion':
      return <Badge variant="outline">Suggestion</Badge>;
    default:
      return <Badge variant="outline">General</Badge>;
  }
}

function getSourceBadge(source: string) {
  switch (source) {
    case 'dashboard':
      return <Badge variant="secondary">Dashboard</Badge>;
    case 'event_app':
      return <Badge variant="secondary">Event App</Badge>;
    case 'ios':
      return <Badge variant="secondary">iOS</Badge>;
    default:
      return <Badge variant="secondary">{source}</Badge>;
  }
}

function getSubmitter(item: AdminFeedbackListItem) {
  if (!item.photographerName && !item.photographerEmail) {
    return <span className="text-muted-foreground">Anonymous</span>;
  }
  return (
    <div className="text-sm">
      <div className="font-medium">{item.photographerName || 'Unnamed'}</div>
      {item.photographerEmail && (
        <div className="text-muted-foreground">{item.photographerEmail}</div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

// =============================================================================
// Page
// =============================================================================

function FeedbackPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [cursor, setCursor] = useState<string | undefined>();

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useAdminFeedback({
    search: deferredSearch || undefined,
    status: status !== 'all' ? status : undefined,
    category: category !== 'all' ? category : undefined,
    cursor,
  });

  const feedbackItems = data?.data;
  const nextCursor = data?.nextCursor;

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Feedback' }]} />

      <div className="p-4 space-y-4">
        {/* Search + Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search feedback..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCursor(undefined);
              }}
              className="pl-9"
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex flex-wrap gap-1">
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

        {/* Category filter */}
        <div className="flex gap-1">
          {CATEGORY_TABS.map((tab) => (
            <Button
              key={tab.value}
              variant={category === tab.value ? 'outline' : 'ghost'}
              size="sm"
              onClick={() => {
                setCategory(tab.value);
                setCursor(undefined);
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

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

        {/* Empty state */}
        {!isLoading && !error && feedbackItems?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {deferredSearch ? 'No feedback matches your search' : 'No feedback yet'}
            </p>
            {deferredSearch && (
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
            )}
          </div>
        )}

        {/* Table */}
        {(isLoading || (feedbackItems && feedbackItems.length > 0)) && (
          <div className="overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Content</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Submitter</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <TableBody>
                  {feedbackItems?.map((item) => (
                    <TableRow
                      key={item.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/feedback/${item.id}`)}
                    >
                      <TableCell className="max-w-[300px]">
                        <span className="line-clamp-2">{item.content}</span>
                      </TableCell>
                      <TableCell>{getCategoryBadge(item.category)}</TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>{getSourceBadge(item.source)}</TableCell>
                      <TableCell>{getSubmitter(item)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(item.createdAt)}
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

export { FeedbackPage as Component };
