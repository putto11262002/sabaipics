// ─── Wire types (match API exactly) ───────────────────────────────────────────

export type BlockType =
  | 'flex'
  | 'logo'
  | 'event-name'
  | 'subtitle'
  | 'gallery'
  | 'qr'
  | 'stat-card'
  | 'social-icon';

export interface SlideshowBlock {
  id: string;
  type: string;
  enabled: boolean;
  props: Record<string, any>;
  children?: SlideshowBlock[];
  position?: {
    x: number; // 0-100 (percentage from left)
    y: number; // 0-100 (percentage from top)
  };
  size?: {
    width: number; // 0-100 (percentage of viewport width)
    height: number; // 0-100 (percentage of viewport height)
  };
}

export interface SlideshowTheme {
  primary: string;
  background: string;
}

export interface SlideshowConfig {
  theme: SlideshowTheme;
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
  size: number; // px, e.g. 48, 64, 96
  shape: 'circle' | 'square' | 'rounded';
}

export interface EventNameProps {
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
}

export interface SubtitleProps {
  fontSize: 'sm' | 'md' | 'lg';
}

export type GalleryDensity = 'sparse' | 'normal' | 'dense';
export type GalleryAlignY = 'start' | 'center' | 'end';

export interface GalleryProps {
  density: GalleryDensity; // sparse=3-4 cols, normal=4-6 cols, dense=6-8 cols
  gap: number;
  autoplaySpeed: number;
  maxHeight?: number | 'full'; // pixels or 'full' for 100vh
  alignY?: GalleryAlignY; // vertical alignment when height < 100%
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
