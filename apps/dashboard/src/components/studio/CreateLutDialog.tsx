import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sabaipics/uiv3/components/dialog';
import { Button } from '@sabaipics/uiv3/components/button';
import { Input } from '@sabaipics/uiv3/components/input';
import { Label } from '@sabaipics/uiv3/components/label';
import { ToggleGroup, ToggleGroupItem } from '@sabaipics/uiv3/components/toggle-group';
import { Alert } from '@sabaipics/uiv3/components/alert';
import { Loader2, Upload } from 'lucide-react';
import { useCreateStudioLut } from '../../hooks/studio/useCreateStudioLut';

type Kind = 'cube' | 'reference';

export function CreateLutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateStudioLut();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<Kind>('cube');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) {
      setKind('cube');
      setName('');
      setFile(null);
      create.reset();
    }
  }, [open, create]);

  const accept = useMemo(() => {
    return kind === 'cube' ? '.cube,text/plain' : 'image/jpeg,image/png,image/webp';
  }, [kind]);

  const canSubmit = name.trim().length > 0 && file != null;

  const submit = async () => {
    if (!file) return;
    await create.mutateAsync({ kind, name: name.trim(), file });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New LUT</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Type</Label>
            <ToggleGroup
              type="single"
              value={kind}
              onValueChange={(v) => v && setKind(v as Kind)}
              className="justify-start"
            >
              <ToggleGroupItem value="cube">Upload .cube</ToggleGroupItem>
              <ToggleGroupItem value="reference">Reference image</ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cinematic Teal"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">File</Label>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
              disabled={create.isPending}
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
                if (f) setFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {create.isError && (
            <Alert variant="destructive">
              {create.error instanceof Error ? create.error.message : 'Failed to create LUT'}
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit || create.isPending}>
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Uploading…
              </>
            ) : (
              'Create'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
