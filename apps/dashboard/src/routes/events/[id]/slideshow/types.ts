export type BlockType = 'header' | 'gallery' | 'qr' | 'stats' | 'social';

export interface HeaderProps {
  align: 'left' | 'center';
  showLogo: boolean;
  showName: boolean;
}

export interface GalleryProps {
  density: 's' | 'm' | 'l';
  autoplaySpeed: number; // seconds, 0 = no autoplay
}

export interface QrProps {
  size: 's' | 'm' | 'l';
  label: string;
}

export interface StatsProps {
  show: ('photos' | 'downloads' | 'searches')[];
}

export interface SocialLink {
  type: 'instagram' | 'facebook' | 'tiktok' | 'line' | 'website';
  url: string;
}

export interface SocialProps {
  links: SocialLink[];
  showIcons: boolean;
}

export type BlockProps = HeaderProps | GalleryProps | QrProps | StatsProps | SocialProps;

export interface SlideshowBlock {
  id: string;
  type: BlockType;
  enabled: boolean;
  props: BlockProps;
}

export interface SlideshowTheme {
  primary: string;
  background: string;
}

export interface SlideshowConfig {
  theme: SlideshowTheme;
  layout: SlideshowBlock[];
}
