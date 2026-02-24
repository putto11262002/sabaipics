import { useMemo, useState } from 'react';
import { SidebarPageHeader } from '../../../components/shell/sidebar-page-header';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import { Alert } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
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
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAutoEditPresets } from '../../../hooks/studio/useAutoEditPresets';
import { useCreateAutoEditPreset } from '../../../hooks/studio/useCreateAutoEditPreset';
import { useUpdateAutoEditPreset } from '../../../hooks/studio/useUpdateAutoEditPreset';
import { useDeleteAutoEditPreset } from '../../../hooks/studio/useDeleteAutoEditPreset';

type PresetForm = {
  name: string;
  contrast: number;
  brightness: number;
  saturation: number;
  sharpness: number;
  autoContrast: boolean;
};

const DEFAULT_FORM: PresetForm = {
  name: '',
  contrast: 1,
  brightness: 1,
  saturation: 1,
  sharpness: 1,
  autoContrast: false,
};

export default function StudioAutoEditPage() {
  const presets = useAutoEditPresets();
  const createPreset = useCreateAutoEditPreset();
  const updatePreset = useUpdateAutoEditPreset();
  const deletePreset = useDeleteAutoEditPreset();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PresetForm>(DEFAULT_FORM);

  const editingPreset = useMemo(
    () => (editingId ? ((presets.data ?? []).find((p) => p.id === editingId) ?? null) : null),
    [editingId, presets.data],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setDialogOpen(true);
  };

  const openEdit = (id: string) => {
    const p = (presets.data ?? []).find((item) => item.id === id);
    if (!p || p.isBuiltin) return;
    setEditingId(id);
    setForm({
      name: p.name,
      contrast: p.contrast,
      brightness: p.brightness,
      saturation: p.saturation,
      sharpness: p.sharpness,
      autoContrast: p.autoContrast,
    });
    setDialogOpen(true);
  };

  const save = async () => {
    try {
      if (editingPreset) {
        await updatePreset.mutateAsync({ id: editingPreset.id, ...form });
        toast.success('Preset updated');
      } else {
        await createPreset.mutateAsync(form);
        toast.success('Preset created');
      }
      setDialogOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
    } catch (e) {
      toast.error('Failed to save preset', {
        description: e instanceof Error ? e.message : 'Something went wrong',
      });
    }
  };

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
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 size-4" />
          New preset
        </Button>
      </SidebarPageHeader>

      <div className="space-y-3 p-4">
        {presets.isError && <Alert variant="destructive">Failed to load auto-edit presets.</Alert>}

        {(presets.data ?? []).map((preset) => (
          <div key={preset.id} className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{preset.name}</p>
                  {preset.isBuiltin && <Badge variant="outline">Built-in</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  C {preset.contrast.toFixed(2)} | B {preset.brightness.toFixed(2)} | S{' '}
                  {preset.saturation.toFixed(2)} | Sh {preset.sharpness.toFixed(2)} | AutoContrast{' '}
                  {preset.autoContrast ? 'On' : 'Off'}
                </p>
              </div>

              {!preset.isBuiltin && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(preset.id)}>
                    <Pencil className="mr-1 size-3" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(preset.id)}>
                    <Trash2 className="mr-1 size-3" />
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPreset ? 'Edit preset' : 'Create preset'}</DialogTitle>
            <DialogDescription>Configure fine-grained auto-edit values.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs">Name</p>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>

            {(
              [
                ['contrast', 'Contrast'],
                ['brightness', 'Brightness'],
                ['saturation', 'Saturation'],
                ['sharpness', 'Sharpness'],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span>{label}</span>
                  <span>{form[key].toFixed(2)}</span>
                </div>
                <Slider
                  value={[form[key]]}
                  min={0.5}
                  max={2.0}
                  step={0.01}
                  onValueChange={(v) => setForm((prev) => ({ ...prev, [key]: v[0] ?? 1 }))}
                />
              </div>
            ))}

            <div className="flex items-center justify-between">
              <p className="text-xs">Auto contrast</p>
              <Switch
                checked={form.autoContrast}
                onCheckedChange={(v) => setForm((prev) => ({ ...prev, autoContrast: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={!form.name.trim() || createPreset.isPending || updatePreset.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
