import { useState, useDeferredValue } from 'react';
import { useNavigate } from 'react-router';
import { AlertCircle, RefreshCw, Users, Search } from 'lucide-react';

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
import { useUsers, type UserListItem } from '../../hooks/users/use-users';

type StatusFilter = 'all' | 'active' | 'banned' | 'deleted';

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'banned', label: 'Suspended' },
  { value: 'deleted', label: 'Deleted' },
];

function getStatusBadge(user: UserListItem) {
  if (user.deletedAt) {
    return <Badge variant="secondary">Deleted</Badge>;
  }
  if (user.bannedAt) {
    return <Badge variant="warning">Suspended</Badge>;
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

function LoadingSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell><Skeleton className="h-4 w-40" /></TableCell>
          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
          <TableCell><Skeleton className="h-5 w-16" /></TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [cursor, setCursor] = useState<string | undefined>();

  const deferredSearch = useDeferredValue(search);

  const { data, isLoading, error, refetch } = useUsers({
    search: deferredSearch || undefined,
    status,
    cursor,
  });

  const users = data?.data;
  const nextCursor = data?.nextCursor;

  return (
    <>
      <SidebarPageHeader breadcrumbs={[{ label: 'Users' }]} />

      <div className="p-4 space-y-4">
        {/* Search + Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
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
            <AlertTitle>Failed to load users</AlertTitle>
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
        {!isLoading && !error && users?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {deferredSearch ? 'No users match your search' : 'No users found'}
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
        {(isLoading || (users && users.length > 0)) && (
          <div className="overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              {isLoading ? (
                <LoadingSkeleton />
              ) : (
                <TableBody>
                  {users?.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/users/${user.id}`)}
                    >
                      <TableCell className="font-medium">
                        {user.name || 'Unnamed'}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{user.balance.toLocaleString()}</TableCell>
                      <TableCell>{getStatusBadge(user)}</TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
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

export { UsersPage as Component };
