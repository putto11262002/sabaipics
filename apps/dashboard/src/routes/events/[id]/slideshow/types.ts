// ─── Wire types (match API exactly) ───────────────────────────────────────────

export type BlockType =
  | 'flex'
  | 'logo'
  | 'event-name'
  | 'subtitle'
  | 'gallery'
  | 'qr'
  | 'stat-card'
  | 'social-icon'
  // New high-level composite blocks
  | 'event-header'
  | 'stats-panel'
  | 'social-links'
  | 'text-block';

export interface SlideshowBlock {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, any>;
  children?: SlideshowBlock[];
}

export interface SlideshowTheme {
  primary: string;
  background: string;
}

export type MaxWidthSize = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface SlideshowLayout {
  gap: SpacingSize;
  padding: SpacingSize;
  align: 'start' | 'center' | 'end';
  maxWidth: MaxWidthSize;
}

export interface SlideshowConfig {
  theme: SlideshowTheme;
  layout: SlideshowLayout;
  blocks: SlideshowBlock[];
}

// ─── Per-block prop interfaces (for type safety within block definitions) ─────

export type SpacingSize = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FlexProps {
  direction: 'row' | 'column';
  align: 'start' | 'center' | 'end';
  justify: 'start' | 'center' | 'end' | 'between';
  gap: SpacingSize;
  padding: SpacingSize;
  wrap: boolean;
}

export interface LogoProps {
  size: 'sm' | 'md' | 'lg';
}

export interface EventNameProps {
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  fontWeight: 'normal' | 'semibold' | 'bold';
}

export interface SubtitleProps {
  fontSize: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  fontWeight: 'normal' | 'semibold' | 'bold';
}

export type GalleryDensity = 'sparse' | 'normal' | 'dense';

export interface GalleryProps {
  density: GalleryDensity; // sparse=2-4 cols, normal=3-6 cols, dense=5-8+ cols
  gap: number;
  autoplaySpeed: number;
  rows?: number; // Number of rows to display (default: 3)
}

export interface QrProps {
  size: 'sm' | 'md' | 'lg';
  label: string;
}

export interface StatCardProps {
  metric: 'photos' | 'downloads' | 'searches';
}

export interface SocialIconProps {
  platform: 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube';
  url: string;
}

// ─── New composite block props ─────────────────────────────────────────────────

export type StatsPanelVariant = 'cards' | 'compact' | 'vertical';
export type SocialLinksVariant = 'horizontal-icons' | 'vertical-list' | 'icon-label';
export type TextBlockVariant = 'heading' | 'paragraph' | 'caption';

export interface EventHeaderProps {
  // Component toggles
  showLogo: boolean;
  showName: boolean;
  showSubtitle: boolean;
  showQr: boolean;
  // Component sizes
  logoSize: 'sm' | 'md' | 'lg';
  qrSize: 'sm' | 'md' | 'lg';
  // Layout controls
  direction: 'row' | 'column';
  align: 'start' | 'center' | 'end';
  justify: 'start' | 'center' | 'end' | 'between';
  gap: SpacingSize;
}

export interface StatsPanelProps {
  variant: StatsPanelVariant;
  metrics: Array<'photos' | 'downloads' | 'searches'>;
}

export interface SocialLinksProps {
  variant: SocialLinksVariant;
  links: Array<{
    platform: 'instagram' | 'facebook' | 'tiktok' | 'x' | 'youtube';
    url: string;
  }>;
}

export interface TextBlockProps {
  variant: TextBlockVariant;
  content: string;
}

// ─── Slideshow context (real data passed to renderers) ────────────────────────

export interface SlideshowContext {
  event: {
    id: string;
    name: string;
    subtitle: string | null;
    logoUrl: string | null;
  };
  stats: {
    photoCount: number;
    searchCount: number;
    downloadCount: number;
  };
  photos: Array<{
    id: string;
    previewUrl: string;
    width: number;
    height: number;
  }>;
  /** When true, gallery fetches real photos from public API */
  liveMode?: boolean;
}

// ─── Device preview modes (editor only) ───────────────────────────────────────

/**
 * Device types for preview
 */
export type DeviceType = 'tv' | 'monitor' | 'tablet' | 'phone';

/**
 * Orientation for device preview
 */
export type Orientation = 'landscape' | 'portrait';

/**
 * Base dimensions for each device type (in default orientation)
 */
export const DEVICE_BASE_DIMENSIONS: Record<DeviceType, { width: number; height: number }> = {
  tv: { width: 1920, height: 1080 }, // 16:9 Full HD
  monitor: { width: 1920, height: 1080 }, // 16:9
  tablet: { width: 1024, height: 768 }, // 4:3
  phone: { width: 390, height: 844 }, // ~9:19 modern phone
};

/**
 * Default orientation for each device type
 */
export const DEVICE_DEFAULT_ORIENTATION: Record<DeviceType, Orientation> = {
  tv: 'landscape',
  monitor: 'landscape',
  tablet: 'landscape',
  phone: 'portrait',
};

/**
 * Get device dimensions with orientation applied
 */
export function getDeviceDimensions(
  deviceType: DeviceType,
  orientation: Orientation,
): { width: number; height: number } {
  const base = DEVICE_BASE_DIMENSIONS[deviceType];
  const defaultOrientation = DEVICE_DEFAULT_ORIENTATION[deviceType];

  // Swap dimensions if orientation differs from default
  if (orientation !== defaultOrientation) {
    return { width: base.height, height: base.width };
  }
  return base;
}

// Legacy export for backward compatibility
export type DeviceMode = DeviceType;
export const DEVICE_DIMENSIONS = DEVICE_BASE_DIMENSIONS;
