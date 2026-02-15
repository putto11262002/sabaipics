import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldDescription } from '@/shared/components/ui/field';
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
import { useEventColorGrade } from '../../hooks/events/useEventColorGrade';
import { useUpdateEventColorGrade } from '../../hooks/events/useUpdateEventColorGrade';

export function ColorGradeCard({ eventId }: { eventId: string }) {
  const navigate = useNavigate();
  const studioLuts = useStudioLuts();
  const eventCg = useEventColorGrade(eventId);
  const update = useUpdateEventColorGrade();

  const completedLuts = useMemo(
    () => (studioLuts.data ?? []).filter((l) => l.status === 'completed'),
    [studioLuts.data],
  );

  const [enabled, setEnabled] = useState(false);
  const [lutId, setLutId] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(75);
  const [includeLuminance, setIncludeLuminance] = useState(false);

  useEffect(() => {
    if (!eventCg.data) return;
    setEnabled(eventCg.data.data.enabled);
    setLutId(eventCg.data.data.lutId);
    setIntensity(eventCg.data.data.intensity);
    setIncludeLuminance(eventCg.data.data.includeLuminance);
  }, [eventCg.data]);

  const save = () => {
    update.mutate(
      { eventId, enabled, lutId, intensity, includeLuminance },
      {
        onSuccess: () => toast.success('Color grade settings saved'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save settings'),
      },
    );
  };

  const disabledReason = enabled && !lutId ? 'Select a LUT to enable color grade' : null;
  const lutControlsDisabled =
    !enabled ||
    update.isPending ||
    eventCg.isLoading ||
    studioLuts.isLoading ||
    studioLuts.isFetching;

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Color grade</h2>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              if (!lutId) return;
              const query = new URLSearchParams({
                intensity: String(intensity),
                includeLuminance: includeLuminance ? 'true' : 'false',
              });
              navigate(`/studio/luts/${lutId}/preview?${query.toString()}`);
            }}
            disabled={lutControlsDisabled || !lutId}
          >
            <Eye className="mr-1 size-3" />
            Preview
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Apply a Studio LUT automatically to new uploads for this event.
        </p>

        {(eventCg.isError || studioLuts.isError) && (
          <Alert variant="destructive">Failed to load color grade settings.</Alert>
        )}

        <FieldGroup>
          <Field orientation="responsive">
            <FieldContent>
              <FieldLabel>Enable</FieldLabel>
              <FieldDescription>Applies to new uploads only</FieldDescription>
            </FieldContent>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </Field>

          <Field orientation="responsive">
            <FieldLabel>LUT</FieldLabel>
            <FieldContent>
              <Select
                value={lutId ?? ''}
                onValueChange={(v) => setLutId(v ? v : null)}
                disabled={lutControlsDisabled || completedLuts.length === 0}
              >
                <SelectTrigger
                  className="w-full"
                  disabled={lutControlsDisabled || completedLuts.length === 0}
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
                <a className="underline" href="/studio/luts">Create a new LUT in Studio</a>
              </FieldDescription>
            </FieldContent>
          </Field>

          <Field orientation="responsive">
            <FieldLabel>Intensity</FieldLabel>
            <FieldContent>
              <div className="flex items-center gap-4">
                <Slider
                  value={[intensity]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={(v) => setIntensity(v[0] ?? 75)}
                  disabled={lutControlsDisabled}
                  className="flex-1"
                />
                <span className="w-10 text-right text-sm text-muted-foreground">{intensity}%</span>
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
              disabled={lutControlsDisabled}
            />
          </Field>
        </FieldGroup>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={save}
            disabled={update.isPending || Boolean(disabledReason)}
            title={disabledReason ?? undefined}
          >
            {update.isPending && <Spinner className="mr-1 size-3" />}
            Save
          </Button>
        </div>
      </section>
    </div>
  );
}
