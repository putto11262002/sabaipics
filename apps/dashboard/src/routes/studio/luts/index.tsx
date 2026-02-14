import { useMemo, useState } from 'react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@sabaipics/uiv3/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sabaipics/uiv3/components/card';
import { Badge } from '@sabaipics/uiv3/components/badge';
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
import { Plus, Download, Trash2, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';

import { useStudioLuts } from '../../../hooks/studio/useStudioLuts';
import { useDeleteStudioLut } from '../../../hooks/studio/useDeleteStudioLut';
import { useDownloadStudioLut } from '../../../hooks/studio/useDownloadStudioLut';
import { useRenameStudioLut } from '../../../hooks/studio/useRenameStudioLut';
import { CreateLutDialog } from '../../../components/studio/CreateLutDialog';
import { LutPreviewDialog } from '../../../components/studio/LutPreviewDialog';

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' {
  if (status === 'completed') return 'default';
  if (status === 'failed' || status === 'expired') return 'destructive';
  return 'secondary';
}

export default function StudioLutsPage() {
  const luts = useStudioLuts();
  const del = useDeleteStudioLut();
  const download = useDownloadStudioLut();
  const rename = useRenameStudioLut();

  const [createOpen, setCreateOpen] = useState(false);
  const [preview, setPreview] = useState<{ open: boolean; lutId: string | null; name?: string }>({
    open: false,
    lutId: null,
  });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameState, setRenameState] = useState<{ id: string; name: string } | null>(null);

  const lutRows = luts.data ?? [];
  const completedLuts = useMemo(() => lutRows.filter((l) => l.status === 'completed'), [lutRows]);

  return (
    <>
      <SidebarPageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Studio' },
          { label: 'LUTs' },
        ]}
      >
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          New LUT
        </Button>
      </SidebarPageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Your LUTs</CardTitle>
            <CardDescription>Upload .cube LUTs or generate from a reference image.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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

            <div className="grid gap-3">
              {lutRows.map((lut) => (
                <div
                  key={lut.id}
                  className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-medium">{lut.name}</div>
                      <Badge variant={statusVariant(lut.status)} className="capitalize">
                        {lut.status}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {lut.sourceType === 'reference_image' ? 'reference' : 'cube'}
                      </Badge>
                    </div>
                    {lut.errorMessage && (
                      <div className="mt-1 text-xs text-destructive">{lut.errorMessage}</div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(lut.createdAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPreview({ open: true, lutId: lut.id, name: lut.name })}
                      disabled={lut.status !== 'completed'}
                    >
                      <Eye className="mr-2 size-4" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRenameState({ id: lut.id, name: lut.name })}
                    >
                      <Pencil className="mr-2 size-4" />
                      Rename
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const { url } = await download.mutateAsync(lut.id);
                          window.open(url, '_blank', 'noopener,noreferrer');
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : 'Download failed');
                        }
                      }}
                      disabled={lut.status !== 'completed'}
                    >
                      <Download className="mr-2 size-4" />
                      Download
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmDeleteId(lut.id)}
                      disabled={del.isPending}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ready to use</CardTitle>
            <CardDescription>
              Completed LUTs available for events: {completedLuts.length}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      <CreateLutDialog open={createOpen} onOpenChange={setCreateOpen} />

      <LutPreviewDialog
        open={preview.open}
        onOpenChange={(open) => setPreview((s) => ({ ...s, open }))}
        lutId={preview.lutId}
        title={preview.name ? `Preview: ${preview.name}` : 'Preview LUT'}
      />

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
