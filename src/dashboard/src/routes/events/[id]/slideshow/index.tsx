import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { PageHeader } from '@/dashboard/src/components/shell/page-header';
import { Button } from '@/shared/components/ui/button';
import { ColorPicker } from '@/shared/components/ui/color-picker';
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@/shared/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import { Maximize, Monitor, Tablet, Smartphone, SlidersHorizontal } from 'lucide-react';
import {
  SlideshowPlayer,
  templateOptions,
  type SlideshowTemplateId,
  type SlideshowConfig,
  type SlideshowEvent,
  type SlideshowStats,
} from '@/shared/slideshow';
import { useEvent } from '@/dashboard/src/hooks/events/useEvent';
import { useSlideshowPhotos } from '@/dashboard/src/hooks/slideshow/useSlideshowPhotos';
import {
  useSlideshowSettings,
  useSaveSlideshowSettings,
} from '@/shared/hooks/rq/events/use-slideshow-settings';
import { toast } from 'sonner';

type DevicePreset = 'desktop' | 'tablet' | 'mobile';

const devicePresets: Record<DevicePreset, { label: string; aspectRatio: number }> = {
  desktop: { label: 'Desktop', aspectRatio: 16 / 9 },
  tablet: { label: 'iPad', aspectRatio: 4 / 3 },
  mobile: { label: 'Mobile', aspectRatio: 9 / 19.5 },
};

const defaultConfig: SlideshowConfig = {
  primaryColor: '#ff6320',
  background: '#fdfdfd',
};

const imageUrlBuilder = (keyOrUrl: string, width: number) => {
  if (keyOrUrl.startsWith('http')) {
    return keyOrUrl;
  }
  const bucket = import.meta.env.VITE_R2_PUBLIC_BUCKET_URL;
  return `${bucket}/${keyOrUrl}?w=${width}`;
};

export default function SlideshowPage() {
  const { id } = useParams<{ id: string }>();
  const [templateId, setTemplateId] = useState<SlideshowTemplateId>('carousel');
  const [config, setConfig] = useState<SlideshowConfig>(defaultConfig);
  const [devicePreset, setDevicePreset] = useState<DevicePreset>('desktop');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data: eventData } = useEvent(id);
  const event = eventData?.data;

  const { data: savedSettingsResponse } = useSlideshowSettings(id);
  const savedSettings = savedSettingsResponse?.data;

  useEffect(() => {
    if (savedSettings) {
      setTemplateId((savedSettings.template as SlideshowTemplateId) ?? 'carousel');
      setConfig({
        primaryColor: savedSettings.primaryColor ?? defaultConfig.primaryColor,
        background: savedSettings.background ?? defaultConfig.background,
      });
    }
  }, [savedSettings]);

  const saveMutation = useSaveSlideshowSettings(id);
  const slideshowPhotos = useSlideshowPhotos(id);

  const slideshowEvent: SlideshowEvent = useMemo(() => ({
    id: event?.id ?? '',
    name: event?.name ?? 'Event',
    subtitle: event?.subtitle,
    logoUrl: event?.logoUrl,
  }), [event]);

  const slideshowStats: SlideshowStats = useMemo(() => ({
    photoCount: 0,
    searchCount: 0,
    downloadCount: 0,
  }), []);

  // Force mobile preset on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handle = () => {
      if (mq.matches) setDevicePreset('mobile');
    };
    handle();
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [previewDimensions, setPreviewDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const aspectRatio = devicePresets[devicePreset].aspectRatio;

      let width: number;
      let height: number;

      if (aspectRatio >= 1) {
        width = containerWidth;
        height = width / aspectRatio;
        if (height > containerHeight) {
          height = containerHeight;
          width = height * aspectRatio;
        }
      } else {
        height = containerHeight;
        width = height * aspectRatio;
        if (width > containerWidth) {
          width = containerWidth;
          height = width / aspectRatio;
        }
      }

      setPreviewDimensions({
        width: Math.floor(width),
        height: Math.floor(height),
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [devicePreset]);

  const handleSave = () => {
    saveMutation.mutate(
      {
        template: templateId,
        primaryColor: config.primaryColor,
        background: config.background,
      },
      {
        onSuccess: () => {
          toast.success('Slideshow settings saved');
        },
        onError: (error) => {
          toast.error('Failed to save settings', { description: error.message });
        },
      },
    );
  };

  if (showFullscreen) {
    return (
      <div className="relative h-screen w-screen">
        <Button
          variant="secondary"
          className="fixed top-4 left-4 z-50"
          onClick={() => setShowFullscreen(false)}
        >
          ← Back
        </Button>
        <SlideshowPlayer
          templateId={templateId}
          event={slideshowEvent}
          photos={slideshowPhotos}
          stats={slideshowStats}
          config={config}
          qrUrl={`${import.meta.env.VITE_EVENT_URL}/${id}/search`}
          imageUrlBuilder={imageUrlBuilder}
        />
      </div>
    );
  }

  const controlsContent = (
    <>
    <FieldGroup>
      <Field orientation="vertical">
        <FieldLabel>Template</FieldLabel>
        <Select value={templateId} onValueChange={(v) => setTemplateId(v as SlideshowTemplateId)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templateOptions.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {templateOptions.find((t) => t.id === templateId)?.description}
        </p>
      </Field>

      <Field orientation="vertical">
        <FieldLabel>Primary Color</FieldLabel>
        <ColorPicker
          value={config.primaryColor?.startsWith('#') ? config.primaryColor : '#ff6320'}
          onChange={(value) => setConfig({ ...config, primaryColor: value })}
        />
      </Field>

      <Field orientation="vertical">
        <FieldLabel>Background</FieldLabel>
        <ColorPicker
          value={config.background?.startsWith('#') ? config.background : '#fdfdfd'}
          onChange={(value) => setConfig({ ...config, background: value })}
        />
      </Field>
    </FieldGroup>

    <div className="mt-auto pt-4">
      <Button
        className="w-full"
        onClick={handleSave}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? 'Saving...' : 'Save'}
      </Button>
    </div>
    </>
  );

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader
        className="border-b"
        backHref={`/events/${id}`}
        breadcrumbs={[{ label: 'Slideshow' }]}
      >
        <Button onClick={() => setShowFullscreen(true)} variant="outline" size="icon-sm" className="md:hidden">
          <Maximize className="size-4" />
        </Button>
        <Button onClick={() => setShowFullscreen(true)} variant="outline" size="sm" className="hidden md:inline-flex">
          Fullscreen
        </Button>
        <Button variant="outline" size="icon-sm" className="md:hidden" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal className="size-4" />
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        {/* Preview area */}
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="mb-3 hidden shrink-0 justify-center md:flex">
            <ToggleGroup
              type="single"
              value={devicePreset}
              onValueChange={(v) => v && setDevicePreset(v as DevicePreset)}
            >
              <ToggleGroupItem value="desktop" aria-label="Desktop view">
                <Monitor className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="tablet" aria-label="Tablet view">
                <Tablet className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="mobile" aria-label="Mobile view">
                <Smartphone className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          <div ref={containerRef} className="relative flex-1 flex items-center justify-center overflow-hidden">
            {previewDimensions.width > 0 && previewDimensions.height > 0 && (
              <div
                className="relative overflow-hidden rounded-lg border bg-black shadow-lg"
                style={{
                  width: previewDimensions.width,
                  height: previewDimensions.height,
                }}
              >
                <SlideshowPlayer
                  templateId={templateId}
                  event={slideshowEvent}
                  photos={slideshowPhotos}
                  stats={slideshowStats}
                  config={config}
                  qrUrl={`${import.meta.env.VITE_EVENT_URL}/${id}/search`}
                  imageUrlBuilder={imageUrlBuilder}
                />
              </div>
            )}
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col overflow-auto p-4 min-h-0">
          {controlsContent}
        </aside>
      </div>

      {/* Mobile sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex flex-col sm:max-w-md md:hidden">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-4">
            {controlsContent}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
