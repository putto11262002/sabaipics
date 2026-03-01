import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/shared/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Alert } from '@/shared/components/ui/alert';
import { Eye } from 'lucide-react';
import { Spinner } from '@/shared/components/ui/spinner';
import { toast } from 'sonner';

import { useStudioLuts } from '../../hooks/studio/useStudioLuts';
import { useAutoEditPresets } from '../../hooks/studio/useAutoEditPresets';
import { useEventImagePipeline } from '../../hooks/events/useEventImagePipeline';
import { useUpdateEventImagePipeline } from '../../hooks/events/useUpdateEventImagePipeline';

export function ImagePipelineCard({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const studioLuts = useStudioLuts();
  const autoEditPresets = useAutoEditPresets();
  const eventPipeline = useEventImagePipeline(eventId);
  const update = useUpdateEventImagePipeline();

  const completedLuts = useMemo(
    () => (studioLuts.data ?? []).filter((l) => l.status === 'completed'),
    [studioLuts.data],
  );

  const [autoEdit, setAutoEdit] = useState(false);
  const [autoEditPresetId, setAutoEditPresetId] = useState<string | null>(null);
  const [autoEditIntensity, setAutoEditIntensity] = useState(75);
  const [lutEnabled, setLutEnabled] = useState(false);
  const [lutId, setLutId] = useState<string | null>(null);
  const [lutIntensity, setLutIntensity] = useState(75);
  const [includeLuminance, setIncludeLuminance] = useState(false);

  // Load initial data
  useEffect(() => {
    if (!eventPipeline.data) return;
    const data = eventPipeline.data.data;
    setAutoEdit(data.autoEdit);
    setAutoEditPresetId(data.autoEditPresetId);
    setAutoEditIntensity(data.autoEditIntensity);
    setLutId(data.lutId);
    setLutEnabled(data.lutId !== null);
    setLutIntensity(data.lutIntensity);
    setIncludeLuminance(data.includeLuminance);
  }, [eventPipeline.data]);

  // When LUT is disabled, clear lutId
  useEffect(() => {
    if (!lutEnabled) {
      setLutId(null);
    }
  }, [lutEnabled]);

  const save = () => {
    update.mutate(
      {
        eventId,
        autoEdit,
        autoEditPresetId,
        autoEditIntensity,
        lutId,
        lutIntensity,
        includeLuminance,
      },
      {
        onSuccess: () => toast.success('Image pipeline settings saved'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings'),
      },
    );
  };

  const controlsDisabled =
    update.isPending ||
    eventPipeline.isLoading ||
    studioLuts.isLoading ||
    autoEditPresets.isLoading;
  const autoEditDisabled = controlsDisabled;
  const lutControlsDisabled = controlsDisabled;

  return (
    <div className="space-y-8">
      {(eventPipeline.isError || studioLuts.isError || autoEditPresets.isError) && (
        <Alert variant="destructive">Failed to load image pipeline settings.</Alert>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Auto-Edit</h3>
          <p className="text-sm text-muted-foreground">
            Automatically enhance colors and exposure on new uploads.
          </p>
        </div>

        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>Enable auto-edit</FieldLabel>
              <FieldDescription>Enhance colors and exposure automatically</FieldDescription>
            </FieldContent>
            <Switch checked={autoEdit} onCheckedChange={setAutoEdit} disabled={autoEditDisabled} />
          </Field>

          <Field orientation="responsive">
            <FieldLabel>Auto-edit preset</FieldLabel>
            <FieldContent>
              <Select
                value={autoEditPresetId ?? ''}
                onValueChange={(v) => setAutoEditPresetId(v || null)}
                disabled={autoEditDisabled || !autoEdit}
              >
                <SelectTrigger className="w-full" disabled={autoEditDisabled || !autoEdit}>
                  <SelectValue placeholder="Select a preset" />
                </SelectTrigger>
                <SelectContent>
                  {(autoEditPresets.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Manage presets in{' '}
                <a className="underline" href="/studio/auto-edit">
                  Studio Auto Edit
                </a>
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="responsive">
            <FieldLabel>Auto-edit intensity</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-4">
                <Slider
                  value={[autoEditIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setAutoEditIntensity(v[0] ?? 100)}
                  disabled={autoEditDisabled || !autoEdit}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm text-muted-foreground">
                  {autoEditIntensity}%
                </span>
              </div>
              <FieldDescription>
                Preset selection will be added in Studio Auto Edit.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Color Grade (LUT)</h3>
            <p className="text-sm text-muted-foreground">
              Apply a Studio LUT for consistent color grading on new uploads.
            </p>
          </div>
          {lutEnabled && lutId && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                if (!lutId) return;
                const query = new URLSearchParams({
                  intensity: String(lutIntensity),
                  includeLuminance: includeLuminance ? 'true' : 'false',
                });
                navigate(`/studio/luts/${lutId}/preview?${query.toString()}`);
              }}
              disabled={lutControlsDisabled}
            >
              <Eye className="mr-1 size-3" />
              Preview
            </Button>
          )}
        </div>

        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>Enable LUT</FieldLabel>
              <FieldDescription>Apply color grading to new uploads</FieldDescription>
            </FieldContent>
            <Switch
              checked={lutEnabled}
              onCheckedChange={setLutEnabled}
              disabled={lutControlsDisabled}
            />
          </Field>

          <Field orientation="responsive">
            <FieldLabel>LUT</FieldLabel>
            <FieldContent>
              <Select
                value={lutId ?? ''}
                onValueChange={(v) => setLutId(v ? v : null)}
                disabled={lutControlsDisabled || !lutEnabled || completedLuts.length === 0}
              >
                <SelectTrigger
                  className="w-full"
                  disabled={lutControlsDisabled || !lutEnabled || completedLuts.length === 0}
                >
                  <SelectValue
                    placeholder={completedLuts.length === 0 ? 'No completed LUTs' : 'Select a LUT'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {completedLuts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                <a className="underline" href="/studio/luts">
                  Create a new LUT in Studio
                </a>
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="responsive">
            <FieldLabel>Intensity</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-4">
                <Slider
                  value={[lutIntensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setLutIntensity(v[0] ?? 100)}
                  disabled={lutControlsDisabled || !lutEnabled}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm text-muted-foreground">
                  {lutIntensity}%
                </span>
              </div>
            </FieldContent>
          </Field>

          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>Include luminance</FieldLabel>
              <FieldDescription>Allow brightness changes</FieldDescription>
            </FieldContent>
            <Switch
              checked={includeLuminance}
              onCheckedChange={setIncludeLuminance}
              disabled={lutControlsDisabled || !lutEnabled}
            />
          </Field>
        </FieldGroup>
      </section>

      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={update.isPending}>
          {update.isPending && <Spinner className="mr-1 size-3" />}
          Save
        </Button>
      </div>
    </div>
  );
}
