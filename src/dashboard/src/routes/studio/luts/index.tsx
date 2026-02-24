import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/shared/components/ui/alert';
import { Spinner } from '@/shared/components/ui/spinner';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@/shared/components/ui/empty';
import { AlertCircle, FileUp, MoreHorizontal, Palette, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { DataTable } from '../../../components/events-table/data-table';

import { useStudioLuts, type StudioLut } from '../../../hooks/studio/useStudioLuts';
import { useDeleteStudioLut } from '../../../hooks/studio/useDeleteStudioLut';
import { useDownloadStudioLut } from '../../../hooks/studio/useDownloadStudioLut';
import { useRenameStudioLut } from '../../../hooks/studio/useRenameStudioLut';
import { CreateLutDialog } from '../../../components/studio/CreateLutDialog';

const columnHelper = createColumnHelper<StudioLut>();

export default function StudioLutsPage() {
  const navigate = useNavigate();
  const luts = useStudioLuts();
  const del = useDeleteStudioLut();
  const download = useDownloadStudioLut();
  const rename = useRenameStudioLut();

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ id: string; name: string } | null>(null);

  // We only show completed LUTs in the Studio table.
  const lutRows = useMemo(
    () => (luts.data ?? []).filter((l) => l.status === 'completed'),
    [luts.data],
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <div className="truncate font-medium">{info.getValue()}</div>,
      }),
      columnHelper.accessor('sourceType', {
        header: 'Source',
        cell: (info) => (
          <Badge variant="outline" className="capitalize">
            {info.getValue() === 'reference_image' ? 'reference' : 'cube'}
          </Badge>
        ),
      }),
      columnHelper.accessor('createdAt', {
        header: 'Created',
        cell: (info) => (
          <span className="text-muted-foreground">
            {new Date(info.getValue()).toLocaleString()}
          </span>
        ),
      }),
      columnHelper.display({
        id: 'actions',
        cell: ({ row }) => {
          const lut = row.original;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[160px]">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => {
                      const query = new URLSearchParams({ name: lut.name });
                      navigate(`/studio/luts/${lut.id}/preview?${query.toString()}`);
                    }}
                  >
                    Preview
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setRenameState({ id: lut.id, name: lut.name })}>
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const newTab = window.open('about:blank', '_blank', 'noopener,noreferrer');
                      try {
                        const res = await download.mutateAsync(lut.id);
                        const url = res.data.getUrl;

                        if (newTab) {
                          newTab.location.href = url;
                        } else {
                          // Popup blocked; fall back to same-tab navigation.
                          window.location.href = url;
                        }
                      } catch (e) {
                        newTab?.close();
                        toast.error('Download failed', {
                          description: e instanceof Error ? e.message : 'Something went wrong',
                        });
                      }
                    }}
                  >
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={del.isPending}
                    onClick={() => setConfirmDeleteId(lut.id)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    [navigate, download, del.isPending, setRenameState, setConfirmDeleteId],
  );

  const table = useReactTable({
    data: lutRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'LUTs' },
        ]}
      >
        <Button
          size="sm"
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          <FileUp className="mr-1 size-4" />
          Upload .cube
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {luts.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-4 w-[40%]" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="ml-auto h-8 w-8 rounded-md" />
              </div>
            ))}
          </div>
        )}
        {luts.isError && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Failed to load LUTs</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>
                {luts.error instanceof Error ? luts.error.message : 'Something went wrong'}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => luts.refetch()}
                disabled={luts.isRefetching}
              >
                {luts.isRefetching ? (
                  <Spinner className="mr-1 size-3" />
                ) : (
                  <RefreshCw className="mr-1 size-3" />
                )}
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!luts.isLoading && !luts.isError && lutRows.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Palette />
              </EmptyMedia>
              <EmptyTitle>No LUTs yet</EmptyTitle>
              <EmptyDescription>
                Create a LUT to start color grading your event photos.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {!luts.isLoading && !luts.isError && lutRows.length > 0 && (
          <DataTable
            table={table}
            emptyMessage="No LUTs found."
            onRowClick={(lut) => {
              const query = new URLSearchParams({ name: lut.name });
              navigate(`/studio/luts/${lut.id}/preview?${query.toString()}`);
            }}
          />
        )}
      </div>

      <CreateLutDialog open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog
        open={confirmDeleteId != null}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete LUT?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the LUT from your Studio. If it is used by an event, deletion will be
              blocked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={async () => {
                const id = confirmDeleteId;
                if (!id) return;
                try {
                  await del.mutateAsync(id);
                  toast.success('LUT deleted');
                } catch (e) {
                  toast.error('Delete failed', {
                    description: e instanceof Error ? e.message : 'Something went wrong',
                  });
                } finally {
                  setConfirmDeleteId(null);
                }
              }}
            >
              {del.isPending ? (
                <>
                  <Spinner className="mr-1 size-3" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={renameState != null} onOpenChange={(open) => !open && setRenameState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename LUT</DialogTitle>
            <DialogDescription>Give this LUT a clearer name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={renameState?.name ?? ''}
              onChange={(e) => setRenameState((s) => (s ? { ...s, name: e.target.value } : s))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameState(null)}>
              Cancel
            </Button>
            <Button
              disabled={rename.isPending}
              onClick={async () => {
                if (!renameState) return;
                try {
                  await rename.mutateAsync({ id: renameState.id, name: renameState.name.trim() });
                  toast.success('Renamed');
                } catch (e) {
                  toast.error('Rename failed', {
                    description: e instanceof Error ? e.message : 'Something went wrong',
                  });
                } finally {
                  setRenameState(null);
                }
              }}
            >
              {rename.isPending ? (
                <>
                  <Spinner className="mr-1 size-3" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
