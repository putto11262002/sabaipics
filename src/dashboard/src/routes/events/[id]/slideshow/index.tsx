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
import { ToggleGroup, ToggleGroupItem } from '@/shared/components/ui/toggle-group';
import { Monitor, Tablet, Smartphone } from 'lucide-react';
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
  primaryColor: '#ff6320', // oklch(0.693 0.203 40.2) - shadcn light mode primary
  background: '#fdfdfd', // oklch(0.993 0 0) - shadcn light mode background
};

// Image URL builder - for preview URLs, just return them directly
// For R2 keys, build the URL
const imageUrlBuilder = (keyOrUrl: string, width: number) => {
  // If it's already a full URL, return it
  if (keyOrUrl.startsWith('http')) {
    return keyOrUrl;
  }
  // Otherwise build R2 URL
  const bucket = import.meta.env.VITE_R2_PUBLIC_BUCKET_URL;
  return `${bucket}/${keyOrUrl}?w=${width}`;
};

export default function SlideshowPage() {
  const { id } = useParams<{ id: string }>();
  const [templateId, setTemplateId] = useState<SlideshowTemplateId>('carousel');
  const [config, setConfig] = useState<SlideshowConfig>(defaultConfig);
  const [devicePreset, setDevicePreset] = useState<DevicePreset>('desktop');
  const [showFullscreen, setShowFullscreen] = useState(false);

  // Fetch event data
  const { data: eventData } = useEvent(id);
  const event = eventData?.data;

  // Fetch saved slideshow settings
  const { data: savedSettingsResponse } = useSlideshowSettings(id);
  const savedSettings = savedSettingsResponse?.data;

  // Load saved settings into local state when they arrive
  useEffect(() => {
    if (savedSettings) {
      setTemplateId((savedSettings.template as SlideshowTemplateId) ?? 'carousel');
      setConfig({
        primaryColor: savedSettings.primaryColor ?? defaultConfig.primaryColor,
        background: savedSettings.background ?? defaultConfig.background,
      });
    }
  }, [savedSettings]);

  // Save mutation
  const saveMutation = useSaveSlideshowSettings(id);

  // Fetch photos with ring buffer management
  const slideshowPhotos = useSlideshowPhotos(id);

  // Transform event data to slideshow format
  const slideshowEvent: SlideshowEvent = useMemo(() => ({
    id: event?.id ?? '',
    name: event?.name ?? 'Event',
    subtitle: event?.subtitle,
    logoUrl: event?.logoUrl,
  }), [event]);

  // Stats - placeholder for now (could fetch from a stats endpoint)
  const slideshowStats: SlideshowStats = useMemo(() => ({
    photoCount: 0,
    searchCount: 0,
    downloadCount: 0,
  }), []);

  // Container ref and size
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewDimensions, setPreviewDimensions] = useState({ width: 0, height: 0 });

  // Calculate preview dimensions to fit container while maintaining aspect ratio
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      const aspectRatio = devicePresets[devicePreset].aspectRatio;

      // Calculate dimensions that fit in container with correct aspect ratio
      let width: number;
      let height: number;

      if (aspectRatio >= 1) {
        // Landscape: try to fill width first
        width = containerWidth;
        height = width / aspectRatio;
        if (height > containerHeight) {
          height = containerHeight;
          width = height * aspectRatio;
        }
      } else {
        // Portrait: try to fill height first
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

  // Fullscreen view - wraps in h-screen w-screen container
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

  // Determine if we should force mobile layout based on device preset
  return (
    <div className="flex h-screen flex-col bg-background">
      <PageHeader
        backHref={`/events/${id}`}
        leftContent={
          <div className="ml-2">
            <h1 className="text-lg font-semibold">Slideshow</h1>
            <p className="text-sm text-muted-foreground">Configure the live photo slideshow</p>
          </div>
        }
      >
        <Button onClick={() => setShowFullscreen(true)} variant="outline" size="sm">
          Fullscreen
        </Button>
        <Button onClick={handleSave} size="sm" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving...' : 'Save'}
        </Button>
      </PageHeader>

      {/* Content - fills remaining height */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Settings */}
        <div className="w-80 shrink-0 overflow-y-auto border-r p-4">
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
        </div>

        {/* Right: Preview with iframe */}
        <div className="flex flex-1 flex-col bg-muted/50 p-4">
          {/* Device selector */}
          <div className="mb-3 flex shrink-0 justify-center">
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

          {/* Preview container - direct render, no iframe */}
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
      </div>
    </div>
  );
}
