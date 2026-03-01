import { useEffect, useRef, useState } from 'react';
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
import { FileUp, Loader2, Upload, X } from 'lucide-react';
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
import { cn } from '@/shared/utils/ui';

const getLutStatus = api.studio.luts.status.$get;
type LutStatusResponse = InferResponseType<typeof getLutStatus, SuccessStatusCode>;

function isCubeFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.cube')) return true;
  if (file.type === 'text/plain') return true;
  return false;
}

export function CreateLutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  const [isDragging, setIsDragging] = useState(false);

  const validateAndSetFile = (f: File) => {
    if (!isCubeFile(f)) {
      setFileError('Please select a .cube LUT file');
      return;
    }
    setFile(f);
    setFileError(null);
  };

  const canSubmit = name.trim().length > 0 && file != null && fileError == null;

  const submit = async () => {
    if (!file) return;
    const { lutId } = await create.mutateAsync({ kind: 'cube', name: name.trim(), file });
    setCreatedLutId(lutId);
  };

  useEffect(() => {
    if (!open) return;
    if (!createdLutId) return;
    if (lutStatusData?.status !== 'completed') return;

    toast.success('LUT created');
    queryClient.invalidateQueries({ queryKey: ['studio', 'luts'] });
    onOpenChange(false);
    resetForm();
  }, [open, createdLutId, lutStatusData?.status, onOpenChange, queryClient]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isProcessing && currentLocation.pathname !== nextLocation.pathname,
  );

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
            <DialogTitle>New LUT (.cube)</DialogTitle>
          </DialogHeader>

          <div className="min-w-0 space-y-4 overflow-hidden">
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
              <Label className="text-xs">LUT file (.cube)</Label>
              {file ? (
                <div className="flex min-w-0 items-center gap-3 overflow-hidden rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
                  <FileUp className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setFileError(null);
                      }}
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!isProcessing) setIsDragging(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragging(false);
                    if (isProcessing) return;
                    const f = e.dataTransfer.files?.[0];
                    if (f) validateAndSetFile(f);
                  }}
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={cn(
                    'flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 transition-colors',
                    isDragging && !isProcessing
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                    isProcessing && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Upload className="mb-2 size-8 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {isDragging ? 'Drop file here' : 'Drag file here or click to browse'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">.cube file</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".cube,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) validateAndSetFile(f);
                  e.target.value = '';
                }}
                disabled={isProcessing}
              />
            </div>

            {fileError && <Alert variant="destructive">{fileError}</Alert>}

            {(() => {
              const errorMessage = create.isError
                ? create.error instanceof Error
                  ? create.error.message
                  : 'Failed to create LUT'
                : lutStatusQuery.isError
                  ? lutStatusQuery.error instanceof Error
                    ? lutStatusQuery.error.message
                    : 'Failed to check LUT status'
                  : lutStatusData?.status === 'failed' || lutStatusData?.status === 'expired'
                    ? lutStatusData?.errorMessage || 'Failed to process LUT'
                    : null;
              return errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null;
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit || isProcessing}>
              {isProcessing ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  {create.isPending
                    ? 'Uploading…'
                    : lutStatusData?.status === 'processing'
                      ? 'Processing…'
                      : 'Creating…'}
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
