import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@sabaipics/uiv3/components/button';
import { Badge } from '@sabaipics/uiv3/components/badge';
import { Separator } from '@sabaipics/uiv3/components/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sabaipics/uiv3/components/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sabaipics/uiv3/components/alert-dialog';
import { Input } from '@sabaipics/uiv3/components/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sabaipics/uiv3/components/table';
import { ChevronDown, MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { useStudioLuts } from '../../../hooks/studio/useStudioLuts';
import { useDeleteStudioLut } from '../../../hooks/studio/useDeleteStudioLut';
import { useDownloadStudioLut } from '../../../hooks/studio/useDownloadStudioLut';
import { useRenameStudioLut } from '../../../hooks/studio/useRenameStudioLut';
import { CreateLutDialog } from '../../../components/studio/CreateLutDialog';

type CreateKind = 'cube' | 'reference';

export default function StudioLutsPage() {
  const navigate = useNavigate();
  const luts = useStudioLuts();
  const del = useDeleteStudioLut();
  const download = useDownloadStudioLut();
  const rename = useRenameStudioLut();

  const [createOpen, setCreateOpen] = useState(false);
  const [createKind, setCreateKind] = useState<CreateKind>('cube');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ id: string; name: string } | null>(null);

  // We only show completed LUTs in the Studio table.
  const lutRows = (luts.data ?? []).filter((l) => l.status === 'completed');

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'LUTs' },
        ]}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 size-4" />
              New LUT
              <ChevronDown className="ml-2 size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px]">
            <DropdownMenuLabel>Create LUT</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => {
                setCreateKind('cube');
                setCreateOpen(true);
              }}
            >
              Upload .cube
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setCreateKind('reference');
                setCreateOpen(true);
              }}
            >
              Reference image
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">Your LUTs</div>
          </div>
          <Separator />
        </div>

        <div className="space-y-3">
          {luts.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
          {luts.isError && (
            <div className="text-sm text-destructive">
              {luts.error instanceof Error ? luts.error.message : 'Failed to load LUTs'}
            </div>
          )}

          {!luts.isLoading && !luts.isError && lutRows.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No LUTs yet. Create one to get started.
            </div>
          )}

          {!luts.isLoading && !luts.isError && lutRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lutRows.map((lut) => {
                  return (
                    <TableRow key={lut.id}>
                      <TableCell className="min-w-0">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{lut.name}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {lut.sourceType === 'reference_image' ? 'reference' : 'cube'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lut.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
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
                            <DropdownMenuItem
                              onClick={() => setRenameState({ id: lut.id, name: lut.name })}
                            >
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const { url } = await download.mutateAsync(lut.id);
                                  window.open(url, '_blank', 'noopener,noreferrer');
                                } catch (e) {
                                  toast.error(e instanceof Error ? e.message : 'Download failed');
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <CreateLutDialog open={createOpen} onOpenChange={setCreateOpen} kind={createKind} />

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
              onClick={async () => {
                const id = confirmDeleteId;
                if (!id) return;
                try {
                  await del.mutateAsync(id);
                  toast.success('LUT deleted');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Delete failed');
                } finally {
                  setConfirmDeleteId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={renameState != null}
        onOpenChange={(open) => !open && setRenameState(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename LUT</AlertDialogTitle>
            <AlertDialogDescription>Give this LUT a clearer name.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Input
              value={renameState?.name ?? ''}
              onChange={(e) => setRenameState((s) => (s ? { ...s, name: e.target.value } : s))}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!renameState) return;
                try {
                  await rename.mutateAsync({ id: renameState.id, name: renameState.name.trim() });
                  toast.success('Renamed');
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : 'Rename failed');
                } finally {
                  setRenameState(null);
                }
              }}
            >
              Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
