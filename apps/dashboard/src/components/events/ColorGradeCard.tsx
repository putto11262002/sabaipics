import { useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@sabaipics/uiv3/components/card';
import { Button } from '@sabaipics/uiv3/components/button';
import { Switch } from '@sabaipics/uiv3/components/switch';
import { Label } from '@sabaipics/uiv3/components/label';
import { Slider } from '@sabaipics/uiv3/components/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sabaipics/uiv3/components/select';
import { Alert } from '@sabaipics/uiv3/components/alert';
import { Eye, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { useStudioLuts } from '../../hooks/studio/useStudioLuts';
import { useEventColorGrade } from '../../hooks/events/useEventColorGrade';
import { useUpdateEventColorGrade } from '../../hooks/events/useUpdateEventColorGrade';
import { LutPreviewDialog } from '../studio/LutPreviewDialog';

export function ColorGradeCard({ eventId }: { eventId: string }) {
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
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!eventCg.data) return;
    setEnabled(eventCg.data.enabled);
    setLutId(eventCg.data.lutId);
    setIntensity(eventCg.data.intensity);
    setIncludeLuminance(eventCg.data.includeLuminance);
  }, [eventCg.data]);

  const save = async () => {
    try {
      await update.mutateAsync({
        eventId,
        enabled,
        lutId,
        intensity,
        includeLuminance,
      });
      toast.success('Color grade settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  const disabledReason = enabled && !lutId ? 'Select a LUT to enable color grade' : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Color grade</CardTitle>
          <CardDescription>
            Apply a Studio LUT automatically to new uploads for this event.
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={save}
              disabled={update.isPending || Boolean(disabledReason)}
              title={disabledReason ?? undefined}
            >
              {update.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Save className="mr-2 size-4" />
              )}
              Save
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          {(eventCg.isError || studioLuts.isError) && (
            <Alert variant="destructive">Failed to load color grade settings.</Alert>
          )}

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label className="text-sm">Enable</Label>
              <p className="text-xs text-muted-foreground">Applies to new uploads only</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">LUT</Label>
            <Select
              value={lutId ?? ''}
              onValueChange={(v) => setLutId(v ? v : null)}
              disabled={completedLuts.length === 0}
            >
              <SelectTrigger>
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
            <p className="text-xs text-muted-foreground">
              Manage LUTs in{' '}
              <a className="underline" href="/studio/luts">
                Studio
              </a>
              .
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Intensity</Label>
              <span className="text-xs text-muted-foreground">{intensity}%</span>
            </div>
            <Slider
              value={[intensity]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setIntensity(v[0] ?? 75)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="space-y-0.5">
              <Label className="text-sm">Include luminance</Label>
              <p className="text-xs text-muted-foreground">Allow brightness changes</p>
            </div>
            <Switch checked={includeLuminance} onCheckedChange={setIncludeLuminance} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPreviewOpen(true)}
              disabled={!lutId}
            >
              <Eye className="mr-2 size-4" />
              Preview
            </Button>
          </div>
        </CardContent>
      </Card>

      <LutPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        lutId={lutId}
        title="Preview on sample image"
        initial={{ intensity, includeLuminance }}
      />
    </>
  );
}
