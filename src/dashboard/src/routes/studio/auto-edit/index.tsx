import { useMemo, useState } from 'react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@/shared/components/ui/button';
import { Alert } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Skeleton } from '@/shared/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui/empty';
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
import { Plus, Pencil, Trash2, SlidersHorizontal, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router';
import {
  createColumnHelper,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useAutoEditPresets } from '../../../hooks/studio/useAutoEditPresets';
import { useDeleteAutoEditPreset } from '../../../hooks/studio/useDeleteAutoEditPreset';
import { DataTable } from '../../../components/events-table/data-table';
import { DataTableSearch } from '../../../components/events-table/data-table-search';
import { DataTablePagination } from '../../../components/events-table/data-table-pagination';

type AutoEditPresetRow = NonNullable<ReturnType<typeof useAutoEditPresets>['data']>[number];
const columnHelper = createColumnHelper<AutoEditPresetRow>();

export default function StudioAutoEditPage() {
  const presets = useAutoEditPresets();
  const deletePreset = useDeleteAutoEditPreset();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const rows = presets.data ?? [];

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor('isBuiltin', {
        header: 'Type',
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="outline">Built-in</Badge>
          ) : (
            <Badge variant="secondary">Custom</Badge>
          ),
      }),
      columnHelper.display({
        id: 'settings',
        header: 'Profile',
        cell: ({ row }) => (
          <div className="flex flex-nowrap gap-1 overflow-hidden">
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              C {row.original.contrast.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              B {row.original.brightness.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              S {row.original.saturation.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              Sh {row.original.sharpness.toFixed(2)}
            </Badge>
            <Badge variant="outline" className="text-[10px] whitespace-nowrap">
              Auto contrast {row.original.autoContrast ? 'On' : 'Off'}
            </Badge>
          </div>
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
        header: '',
        cell: ({ row }) => {
          if (row.original.isBuiltin) return null;

          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0 text-muted-foreground">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[150px]">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuItem asChild>
                    <Link to={`/studio/auto-edit/${row.original.id}/edit`}>
                      <Pencil className="mr-2 size-3" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={deletePreset.isPending}
                    onClick={() => setDeleteId(row.original.id)}
                  >
                    <Trash2 className="mr-2 size-3" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      }),
    ],
    [deletePreset.isPending],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await deletePreset.mutateAsync(deleteId);
      toast.success('Preset deleted');
    } catch (e) {
      toast.error('Failed to delete preset', {
        description: e instanceof Error ? e.message : 'Something went wrong',
      });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'Auto Edit' },
        ]}
      >
        <Button size="sm" asChild>
          <Link to="/studio/auto-edit/new">
            <Plus className="mr-1 size-4" />
            New preset
          </Link>
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {presets.isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-2 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        )}

        {presets.isError ? (
          <Alert variant="destructive">Failed to load auto-edit presets.</Alert>
        ) : null}

        {!presets.isLoading && !presets.isError && rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SlidersHorizontal className="size-8" />
              </EmptyMedia>
              <EmptyTitle>No auto-edit presets yet</EmptyTitle>
              <EmptyDescription>
                Create your first preset to reuse your style quickly.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {!presets.isLoading && !presets.isError && rows.length > 0 ? (
          <div className="space-y-4">
            <DataTableSearch table={table} column="name" placeholder="Filter by preset name..." />
            <DataTable table={table} emptyMessage="No presets found." />
            <DataTablePagination table={table} showSelectedCount={false} />
          </div>
        ) : null}
      </div>

      <AlertDialog open={deleteId != null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete preset?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the custom auto-edit preset.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={deletePreset.isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
