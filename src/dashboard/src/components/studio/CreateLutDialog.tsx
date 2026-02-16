import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Alert } from '@/shared/components/ui/alert';
import { Loader2, Upload } from 'lucide-react';
import { useCreateStudioLut } from '../../hooks/studio/useCreateStudioLut';
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
import { useBlocker } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useApiQuery } from '@/shared/hooks/rq/use-api-query';
import type { InferResponseType } from 'hono/client';
import type { SuccessStatusCode } from 'hono/utils/http-status';
import { toast } from 'sonner';

type Kind = 'cube' | 'reference';

const getLutStatus = api.studio.luts.status.$get;
type LutStatusResponse = InferResponseType<typeof getLutStatus, SuccessStatusCode>;

function isCubeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.cube')) return true;
  // Some browsers may set empty type for unknown extensions
  if (file.type === 'text/plain') return true;
  return false;
}

function isReferenceImageFile(file: File): boolean {
  return file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
}

export function CreateLutDialog({
  open,
  onOpenChange,
  kind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: Kind;
}) {
  const create = useCreateStudioLut();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [createdLutId, setCreatedLutId] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const resetForm = () => {
    setName('');
    setFile(null);
    setFileError(null);
    setCreatedLutId(null);
    create.reset();
  };

  // If the creation kind changes, clear any previously selected file.
  useEffect(() => {
    setFile(null);
    setFileError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const lutStatusQuery = useApiQuery<LutStatusResponse>({
    queryKey: ['studio', 'luts', 'status', createdLutId],
    apiFn: (opts) => getLutStatus({ query: { id: createdLutId! } }, opts),
    enabled: createdLutId != null,
    refetchInterval: (q) => {
      const status = (q.state.data as LutStatusResponse | undefined)?.data?.status;
      if (!status) return 2000;
      if (status === 'completed' || status === 'failed' || status === 'expired') {
        return false;
      }
      return 2000;
    },
    staleTime: 0,
    retry: false,
  });

  const lutStatusData = lutStatusQuery.data?.data;

  const isProcessing =
    create.isPending ||
    (createdLutId != null &&
      (lutStatusQuery.isFetching ||
        lutStatusData?.status === 'pending' ||
        lutStatusData?.status === 'processing'));

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isProcessing) {
      setConfirmCloseOpen(true);
      return;
    }

    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetForm();
    }
  };

  const accept = useMemo(() => {
    return kind === 'cube' ? '.cube,text/plain' : 'image/jpeg,image/png,image/webp';
  }, [kind]);

  const title = kind === 'cube' ? 'New LUT (.cube)' : 'New LUT (Reference image)';
  const fileLabel = kind === 'cube' ? 'LUT file (.cube)' : 'Reference image';

  const canSubmit = name.trim().length > 0 && file != null && fileError == null;

  const submit = async () => {
    if (!file) return;

    if (kind === 'cube' && !isCubeFile(file)) {
      setFileError('Please select a .cube LUT file');
      return;
    }
    if (kind === 'reference' && !isReferenceImageFile(file)) {
      setFileError('Please select a JPEG, PNG, or WebP image');
      return;
    }

    const { lutId } = await create.mutateAsync({ kind, name: name.trim(), file });
    setCreatedLutId(lutId);
  };

  // Auto-close once LUT is fully processed.
  useEffect(() => {
    if (!open) return;
    if (!createdLutId) return;
    if (lutStatusData?.status !== 'completed') return;

    toast.success('LUT created');
    queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    onOpenChange(false);
    resetForm();
  }, [open, createdLutId, lutStatusData?.status, onOpenChange, queryClient]);

  // Block in-app navigation while processing.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isProcessing && currentLocation.pathname !== nextLocation.pathname,
  );

  // Browser navigation guard (back button, close tab, refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isProcessing) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isProcessing]);

  return (
    <>
      {blocker.state === 'blocked' && (
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>LUT creation in progress</AlertDialogTitle>
              <AlertDialogDescription>
                If you leave now, this LUT may not finish processing.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => blocker.reset()}>Stay</AlertDialogCancel>
              <AlertDialogAction onClick={() => blocker.proceed()}>Leave</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cinematic Teal"
                disabled={isProcessing}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">{fileLabel}</Label>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <span className="truncate">{file ? file.name : 'Choose a file…'}</span>
                <Upload className="size-4 text-muted-foreground" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={accept}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    setFile(f);
                    setFileError(null);
                  }
                  e.target.value = '';
                }}
                disabled={isProcessing}
              />
            </div>

            {fileError && <Alert variant="destructive">{fileError}</Alert>}

            {isProcessing && (
              <div className="rounded-md border px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  <span>
                    {create.isPending
                      ? 'Uploading…'
                      : lutStatusData?.status === 'processing'
                        ? 'Processing…'
                        : lutStatusData?.status === 'pending'
                          ? 'Queued…'
                          : 'Working…'}
                  </span>
                </div>
              </div>
            )}

            {(lutStatusData?.status === 'failed' || lutStatusData?.status === 'expired') && (
              <Alert variant="destructive">
                {lutStatusData?.errorMessage || 'Failed to process LUT'}
              </Alert>
            )}

            {create.isError && (
              <Alert variant="destructive">
                {create.error instanceof Error ? create.error.message : 'Failed to create LUT'}
              </Alert>
            )}

            {lutStatusQuery.isError && (
              <Alert variant="destructive">
                {lutStatusQuery.error instanceof Error
                  ? lutStatusQuery.error.message
                  : 'Failed to load LUT status'}
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Working…
                </>
              ) : (
                'Create'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>LUT creation in progress</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this dialog? The LUT may not finish processing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmCloseOpen(false)}>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmCloseOpen(false);
                onOpenChange(false);
                resetForm();
              }}
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
